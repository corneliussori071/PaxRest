import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
  sanitizeString, validatePagination, applyPagination,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;
    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    if (!hasPermission(auth, 'manage_suppliers')) return errorResponse('Forbidden', 403);

    switch (action) {
      case 'list':
        return await listSuppliers(req, supabase, auth, branchId);
      case 'upsert':
        return await upsertSupplier(req, supabase, auth, branchId);
      case 'purchase-orders':
        return await listPurchaseOrders(req, supabase, auth, branchId);
      case 'purchase-order':
        return req.method === 'GET'
          ? await getPurchaseOrder(req, supabase, auth, branchId)
          : await createPurchaseOrder(req, supabase, auth, branchId);
      case 'receive':
        return await receivePurchaseOrder(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown suppliers action', 404);
    }
  } catch (err) {
    console.error('Suppliers error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listSuppliers(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return errorResponse(error.message);
  return jsonResponse({ suppliers: data });
}

async function upsertSupplier(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.name) return errorResponse('Missing supplier name');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    contact_person: body.contact_person ? sanitizeString(body.contact_person) : null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ? sanitizeString(body.address) : null,
    notes: body.notes ? sanitizeString(body.notes) : null,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('suppliers').update(record).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ supplier: data });
  } else {
    const { data, error } = await supabase
      .from('suppliers').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ supplier: data }, 201);
  }
}

async function listPurchaseOrders(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('purchase_orders')
    .select('*, suppliers(name), purchase_order_items(*)', { count: 'exact' })
    .eq('branch_id', branchId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getPurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing purchase order id');

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(name, contact_person, phone), purchase_order_items(*, inventory_items(name, unit))')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ purchase_order: data });
}

async function createPurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.supplier_id || !body.items || body.items.length === 0) {
    return errorResponse('Missing supplier_id or items');
  }

  // Calculate total
  let total = 0;
  for (const item of body.items) {
    total += (item.quantity ?? 0) * (item.unit_cost ?? 0);
  }

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      supplier_id: body.supplier_id,
      status: 'draft',
      total_amount: total,
      notes: body.notes ? sanitizeString(body.notes) : null,
      expected_delivery_date: body.expected_delivery_date ?? null,
      created_by: auth.userId,
      created_by_name: body.created_by_name ?? auth.email,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Insert items
  const poItems = body.items.map((item: any) => ({
    purchase_order_id: po.id,
    inventory_item_id: item.inventory_item_id,
    quantity_ordered: item.quantity,
    unit_cost: item.unit_cost ?? 0,
    total_cost: (item.quantity ?? 0) * (item.unit_cost ?? 0),
  }));

  await supabase.from('purchase_order_items').insert(poItems);

  return jsonResponse({ purchase_order: po }, 201);
}

async function receivePurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.purchase_order_id || !body.items) {
    return errorResponse('Missing purchase_order_id or items');
  }

  // Process each received item
  for (const item of body.items) {
    if (!item.purchase_order_item_id || !item.quantity_received) continue;

    // Update PO item
    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: item.quantity_received })
      .eq('id', item.purchase_order_item_id);

    // Add to inventory
    if (item.inventory_item_id && item.quantity_received > 0) {
      // Get current qty
      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('quantity, cost_per_unit')
        .eq('id', item.inventory_item_id)
        .eq('branch_id', branchId)
        .single();

      if (invItem) {
        const newQty = invItem.quantity + item.quantity_received;
        await supabase
          .from('inventory_items')
          .update({
            quantity: newQty,
            cost_per_unit: item.unit_cost ?? invItem.cost_per_unit,
          })
          .eq('id', item.inventory_item_id);

        // Record stock movement
        await supabase.from('stock_movements').insert({
          company_id: auth.companyId,
          branch_id: branchId,
          inventory_item_id: item.inventory_item_id,
          movement_type: 'purchase_receive',
          quantity_change: item.quantity_received,
          quantity_before: invItem.quantity,
          quantity_after: newQty,
          unit_cost: item.unit_cost ?? invItem.cost_per_unit,
          reference_type: 'purchase_order',
          reference_id: body.purchase_order_id,
          performed_by: auth.userId,
          performed_by_name: body.received_by_name ?? auth.email,
        });
      }
    }
  }

  // Update PO status
  await supabase
    .from('purchase_orders')
    .update({
      status: body.partial ? 'partially_received' : 'received',
      received_at: new Date().toISOString(),
      received_by: auth.userId,
      received_by_name: body.received_by_name ?? auth.email,
    })
    .eq('id', body.purchase_order_id);

  return jsonResponse({ received: true });
}
