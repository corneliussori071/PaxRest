import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId,
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

    if (!hasPermission(auth, 'manage_suppliers') && !hasPermission(auth, 'manage_purchases')) {
      return errorResponse('Forbidden', 403);
    }

    switch (action) {
      // Suppliers
      case 'list':            return await listSuppliers(req, supabase, auth, branchId);
      case 'upsert':          return await upsertSupplier(req, supabase, auth, branchId);
      case 'delete':          return await deleteSupplier(req, supabase, auth, branchId);
      // Purchase Orders
      case 'purchase-orders': return await listPurchaseOrders(req, supabase, auth, branchId);
      case 'purchase-order':
        if (req.method === 'GET') return await getPurchaseOrder(req, supabase, auth, branchId);
        if (req.method === 'POST') return await createPurchaseOrder(req, supabase, auth, branchId);
        if (req.method === 'PUT') return await updatePurchaseOrder(req, supabase, auth, branchId);
        return errorResponse('Method not allowed', 405);
      case 'delete-po':       return await deletePurchaseOrder(req, supabase, auth, branchId);
      // PO Lifecycle
      case 'submit-order':    return await submitOrder(req, supabase, auth, branchId);
      case 'confirm-receipt': return await confirmReceipt(req, supabase, auth, branchId);
      case 'review-receipt':  return await reviewReceipt(req, supabase, auth, branchId);
      case 'update-inventory':return await updateInventory(req, supabase, auth, branchId);
      // Email
      case 'email-request':   return await emailRequest(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown suppliers action', 404);
    }
  } catch (err) {
    console.error('Suppliers error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ============================================================
// SUPPLIERS (company-level, shared across branches)
// ============================================================

async function listSuppliers(req: Request, supabase: any, auth: AuthContext, _branchId: string) {
  if (!auth.companyId) return errorResponse('No company context');
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? '';

  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (search) {
    query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ suppliers: data ?? [] });
}

async function upsertSupplier(req: Request, supabase: any, auth: AuthContext, _branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!auth.companyId) return errorResponse('No company context');
  const body = await req.json();
  if (!body.name?.trim()) return errorResponse('Supplier name is required');

  const record = {
    company_id: auth.companyId,
    name: sanitizeString(body.name),
    contact_person: body.contact_person ? sanitizeString(body.contact_person) : null,
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    address: body.address ? sanitizeString(body.address) : null,
    payment_terms: body.payment_terms ? sanitizeString(body.payment_terms) : null,
    notes: body.notes ? sanitizeString(body.notes) : null,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('suppliers').update(record).eq('id', body.id).eq('company_id', auth.companyId).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ supplier: data });
  } else {
    const { data, error } = await supabase.from('suppliers').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ supplier: data }, 201);
  }
}

async function deleteSupplier(req: Request, supabase: any, auth: AuthContext, _branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing supplier id');
  const { error } = await supabase
    .from('suppliers').update({ is_active: false }).eq('id', body.id).eq('company_id', auth.companyId);
  if (error) return errorResponse(error.message);
  return jsonResponse({ deleted: true });
}

// ============================================================
// PURCHASE ORDERS
// ============================================================

function generateOrderNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PO-${d}-${r}`;
}

async function listPurchaseOrders(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('purchase_orders')
    .select('*, suppliers(id,name,email,contact_person), purchase_order_items(id)', { count: 'exact' })
    .eq('branch_id', branchId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data ?? [], total: count ?? 0, page, page_size: pageSize });
}

async function getPurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing purchase order id');

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(id,name,contact_person,phone,email,address), purchase_order_items(*)')
    .eq('id', id).eq('branch_id', branchId).single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ purchase_order: data });
}

async function createPurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.supplier_id) return errorResponse('Missing supplier_id');
  if (!Array.isArray(body.items) || body.items.length === 0) return errorResponse('At least one item is required');

  const { data: supplier, error: sErr } = await supabase
    .from('suppliers').select('name').eq('id', body.supplier_id).eq('company_id', auth.companyId).single();
  if (sErr || !supplier) return errorResponse('Supplier not found');

  let subtotal = 0;
  for (const item of body.items) subtotal += Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0);

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders').insert({
      company_id: auth.companyId,
      branch_id: branchId,
      supplier_id: body.supplier_id,
      supplier_name: supplier.name,
      order_number: generateOrderNumber(),
      status: 'draft',
      subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      notes: body.notes ? sanitizeString(body.notes) : null,
      expected_date: body.expected_date ?? null,
      ordered_by: auth.userId,
      ordered_by_name: auth.name ?? auth.email,
    }).select().single();
  if (poErr) return errorResponse(poErr.message);

  const itemIds = body.items.filter((i: any) => i.inventory_item_id).map((i: any) => i.inventory_item_id);
  const invNameMap: Record<string, string> = {};
  if (itemIds.length > 0) {
    const { data: invItems } = await supabase.from('inventory_items').select('id,name').in('id', itemIds);
    for (const inv of invItems ?? []) invNameMap[inv.id] = inv.name;
  }

  const poItems = body.items.map((item: any) => ({
    purchase_order_id: po.id,
    inventory_item_id: item.inventory_item_id || null,
    inventory_item_name: item.inventory_item_id ? (invNameMap[item.inventory_item_id] ?? item.item_name ?? '') : (item.item_name ?? ''),
    quantity_ordered: Number(item.quantity_ordered ?? 1),
    quantity_received: 0,
    unit: item.unit ?? null,
    unit_cost: Number(item.unit_cost ?? 0),
    total_cost: Number(item.quantity_ordered ?? 1) * Number(item.unit_cost ?? 0),
    category: item.category ?? null,
    packaging_type: item.packaging_type ?? 'single',
    items_per_pack: item.items_per_pack ?? 1,
    is_manual: !item.inventory_item_id,
    reviewed: false,
  }));

  const { error: itemsErr } = await supabase.from('purchase_order_items').insert(poItems);
  if (itemsErr) { await supabase.from('purchase_orders').delete().eq('id', po.id); return errorResponse(itemsErr.message); }

  return jsonResponse({ purchase_order: po }, 201);
}

async function updatePurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');

  const { data: existing } = await supabase.from('purchase_orders').select('status').eq('id', body.id).eq('branch_id', branchId).single();
  if (!existing) return errorResponse('Purchase order not found', 404);
  if (existing.status !== 'draft') return errorResponse('Only draft orders can be edited');

  const patch: Record<string, any> = {};
  if (body.notes !== undefined) patch.notes = body.notes ? sanitizeString(body.notes) : null;
  if (body.expected_date !== undefined) patch.expected_date = body.expected_date ?? null;

  if (body.supplier_id) {
    const { data: supplier } = await supabase.from('suppliers').select('name').eq('id', body.supplier_id).single();
    if (supplier) { patch.supplier_id = body.supplier_id; patch.supplier_name = supplier.name; }
  }

  if (Array.isArray(body.items)) {
    let subtotal = 0;
    for (const item of body.items) subtotal += Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0);
    patch.subtotal = subtotal;
    patch.total_amount = subtotal;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', body.id).eq('branch_id', branchId);
    if (error) return errorResponse(error.message);
  }

  if (Array.isArray(body.items)) {
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', body.id);
    const itemIds = body.items.filter((i: any) => i.inventory_item_id).map((i: any) => i.inventory_item_id);
    const invNameMap: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: invItems } = await supabase.from('inventory_items').select('id,name').in('id', itemIds);
      for (const inv of invItems ?? []) invNameMap[inv.id] = inv.name;
    }
    const poItems = body.items.map((item: any) => ({
      purchase_order_id: body.id,
      inventory_item_id: item.inventory_item_id || null,
      inventory_item_name: item.inventory_item_id ? (invNameMap[item.inventory_item_id] ?? item.item_name ?? '') : (item.item_name ?? ''),
      quantity_ordered: Number(item.quantity_ordered ?? 1),
      quantity_received: 0,
      unit: item.unit ?? null,
      unit_cost: Number(item.unit_cost ?? 0),
      total_cost: Number(item.quantity_ordered ?? 1) * Number(item.unit_cost ?? 0),
      category: item.category ?? null,
      packaging_type: item.packaging_type ?? 'single',
      items_per_pack: item.items_per_pack ?? 1,
      is_manual: !item.inventory_item_id,
      reviewed: false,
    }));
    await supabase.from('purchase_order_items').insert(poItems);
  }

  const { data } = await supabase.from('purchase_orders')
    .select('*, suppliers(id,name), purchase_order_items(*)').eq('id', body.id).single();
  return jsonResponse({ purchase_order: data });
}

async function deletePurchaseOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');

  const { data: existing } = await supabase.from('purchase_orders').select('status').eq('id', body.id).eq('branch_id', branchId).single();
  if (!existing) return errorResponse('Purchase order not found', 404);
  if (!['draft', 'cancelled'].includes(existing.status)) return errorResponse('Only draft orders can be deleted');

  await supabase.from('purchase_order_items').delete().eq('purchase_order_id', body.id);
  const { error } = await supabase.from('purchase_orders').delete().eq('id', body.id).eq('branch_id', branchId);
  if (error) return errorResponse(error.message);
  return jsonResponse({ deleted: true });
}

// ============================================================
// PO LIFECYCLE
// ============================================================

async function submitOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');
  const { data: existing } = await supabase.from('purchase_orders').select('status').eq('id', body.id).eq('branch_id', branchId).single();
  if (!existing) return errorResponse('Purchase order not found', 404);
  if (existing.status !== 'draft') return errorResponse('Only draft orders can be submitted');
  const { error } = await supabase.from('purchase_orders').update({ status: 'submitted' }).eq('id', body.id);
  if (error) return errorResponse(error.message);
  return jsonResponse({ submitted: true, email_sent: false, email_note: 'Email service not yet configured.' });
}

async function confirmReceipt(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');
  const { data: existing } = await supabase.from('purchase_orders').select('status').eq('id', body.id).eq('branch_id', branchId).single();
  if (!existing) return errorResponse('Purchase order not found', 404);
  if (['received', 'partially_received'].includes(existing.status)) return errorResponse('Goods already marked as received');
  const { error } = await supabase.from('purchase_orders').update({
    status: 'received',
    received_at: new Date().toISOString(),
    received_by: auth.userId,
    received_by_name: auth.name ?? auth.email,
  }).eq('id', body.id);
  if (error) return errorResponse(error.message);
  return jsonResponse({ confirmed: true });
}

async function reviewReceipt(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');
  if (!Array.isArray(body.items)) return errorResponse('Missing items array');

  const { data: existing } = await supabase.from('purchase_orders').select('status').eq('id', body.id).eq('branch_id', branchId).single();
  if (!existing) return errorResponse('Purchase order not found', 404);
  if (!['received', 'partially_received'].includes(existing.status)) {
    return errorResponse('Confirm receipt first before reviewing items');
  }

  const errors: string[] = [];
  for (const item of body.items) {
    if (!item.id) continue;
    const patch: Record<string, any> = { reviewed: true };
    if (item.inventory_item_name !== undefined) patch.inventory_item_name = sanitizeString(item.inventory_item_name);
    if (item.barcode !== undefined) patch.barcode = item.barcode?.trim() || null;
    if (item.selling_price !== undefined) patch.selling_price = Number(item.selling_price ?? 0);
    if (item.unit_cost !== undefined) patch.unit_cost = Number(item.unit_cost ?? 0);
    if (item.quantity_received !== undefined) patch.quantity_received = Number(item.quantity_received ?? 0);
    if (item.unit !== undefined) patch.unit = item.unit || null;
    if (item.category !== undefined) patch.category = item.category?.trim() || null;
    if (item.packaging_type !== undefined) patch.packaging_type = item.packaging_type ?? 'single';
    if (item.items_per_pack !== undefined) patch.items_per_pack = Number(item.items_per_pack ?? 1);
    const { error } = await supabase.from('purchase_order_items').update(patch).eq('id', item.id).eq('purchase_order_id', body.id);
    if (error) errors.push(`Item ${item.id}: ${error.message}`);
  }

  await supabase.from('purchase_orders').update({
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.userId,
    reviewed_by_name: auth.name ?? auth.email,
  }).eq('id', body.id);

  if (errors.length > 0) return errorResponse(`Partial: ${errors.join('; ')}`, 207);
  return jsonResponse({ reviewed: true, items_updated: body.items.length });
}

async function updateInventory(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders').select('*, purchase_order_items(*)').eq('id', body.id).eq('branch_id', branchId).single();
  if (poErr || !po) return errorResponse('Purchase order not found', 404);
  if (!['received', 'partially_received'].includes(po.status)) {
    return errorResponse('Order must be in received state before updating inventory');
  }

  const service = createServiceClient();
  const results: Array<{ item_name: string; action: string; inventory_id: string }> = [];
  const errors: string[] = [];

  for (const item of po.purchase_order_items as any[]) {
    const qtyReceived = Number(item.quantity_received ?? 0);
    if (qtyReceived <= 0) continue;

    let inventoryId: string | null = item.inventory_item_id ?? null;
    let currentQty = 0;
    let currentCost = 0;

    // Try to find existing inventory item if not linked
    if (!inventoryId) {
      if (item.barcode) {
        const { data: byBarcode } = await service.from('inventory_items').select('id,quantity,cost_per_unit')
          .eq('branch_id', branchId).eq('barcode', item.barcode).maybeSingle();
        if (byBarcode) inventoryId = byBarcode.id;
      }
      if (!inventoryId && item.inventory_item_name?.trim()) {
        const { data: byName } = await service.from('inventory_items').select('id,quantity,cost_per_unit')
          .eq('branch_id', branchId).ilike('name', item.inventory_item_name.trim()).maybeSingle();
        if (byName) inventoryId = byName.id;
      }
    }

    if (inventoryId) {
      const { data: inv } = await service.from('inventory_items').select('quantity,cost_per_unit').eq('id', inventoryId).single();
      currentQty = Number(inv?.quantity ?? 0);
      currentCost = Number(inv?.cost_per_unit ?? 0);
    }

    const newQty = currentQty + qtyReceived;
    const newCost = Number(item.unit_cost ?? 0) > 0 ? Number(item.unit_cost) : currentCost;

    const invPatch: Record<string, any> = { quantity: newQty, cost_per_unit: newCost, last_restock_at: new Date().toISOString() };
    if (item.barcode) invPatch.barcode = item.barcode;
    if (Number(item.selling_price) > 0) invPatch.selling_price = Number(item.selling_price);
    if (item.category) invPatch.category = item.category;

    let action = 'updated';

    if (inventoryId) {
      const { error: updErr } = await service.from('inventory_items').update(invPatch).eq('id', inventoryId);
      if (updErr) { errors.push(`"${item.inventory_item_name}": ${updErr.message}`); continue; }
    } else {
      if (!item.inventory_item_name?.trim()) { errors.push('Manual item has no name  skipped'); continue; }
      const { data: created, error: createErr } = await service.from('inventory_items').insert({
        company_id: po.company_id,
        branch_id: branchId,
        name: item.inventory_item_name.trim(),
        unit: item.unit ?? 'pcs',
        quantity: newQty,
        cost_per_unit: newCost,
        barcode: item.barcode ?? null,
        selling_price: Number(item.selling_price ?? 0),
        category: item.category ?? null,
        packaging_type: item.packaging_type ?? 'single',
        items_per_pack: item.items_per_pack ?? 1,
        is_active: true,
      }).select('id').single();
      if (createErr) { errors.push(`"${item.inventory_item_name}": ${createErr.message}`); continue; }
      inventoryId = created.id;
      action = 'created';
      await service.from('purchase_order_items').update({ inventory_item_id: inventoryId }).eq('id', item.id);
    }

    await service.from('stock_movements').insert({
      company_id: po.company_id,
      branch_id: branchId,
      inventory_item_id: inventoryId,
      movement_type: 'purchase_receive',
      quantity_change: qtyReceived,
      quantity_before: currentQty,
      quantity_after: newQty,
      unit_cost: newCost,
      reference_type: 'purchase_order',
      reference_id: po.id,
      notes: `PO ${po.order_number} received`,
      performed_by: auth.userId,
      performed_by_name: auth.name ?? auth.email,
    });

    results.push({ item_name: item.inventory_item_name, action, inventory_id: inventoryId! });
  }

  await service.from('purchase_orders').update({
    inventory_updated_at: new Date().toISOString(),
    inventory_updated_by: auth.userId,
    inventory_updated_by_name: auth.name ?? auth.email,
  }).eq('id', body.id);

  return jsonResponse({ updated: results, errors, total_processed: results.length });
}

// ============================================================
// EMAIL PLACEHOLDER
// ============================================================

async function emailRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing purchase order id');
  const { data: po } = await supabase
    .from('purchase_orders').select('order_number, suppliers(name,email)')
    .eq('id', body.id).eq('branch_id', branchId).single();
  if (!po) return errorResponse('Purchase order not found', 404);
  console.log(`[email-placeholder] PO ${po.order_number}  ${po.suppliers?.email}`);
  return jsonResponse({
    sent: false,
    purchase_order_number: po.order_number,
    supplier_email: po.suppliers?.email ?? null,
    message: 'Email service not yet configured. This is a placeholder.',
  });
}
