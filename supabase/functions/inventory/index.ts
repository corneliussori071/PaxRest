import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
  validatePagination, applyPagination, sanitizeString,
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

    switch (action) {
      case 'items':
        return req.method === 'GET'
          ? await listItems(req, supabase, auth, branchId)
          : await upsertItem(req, supabase, auth, branchId);
      case 'item':
        if (req.method === 'GET') return await getItem(req, supabase, auth, branchId);
        if (req.method === 'DELETE') return await deactivateItem(req, supabase, auth, branchId);
        return errorResponse('Method not allowed', 405);
      case 'adjust':
        return await adjustStock(req, supabase, auth, branchId);
      case 'movements':
        return await listMovements(req, supabase, auth, branchId);
      case 'wastage':
        return req.method === 'GET'
          ? await listWastage(req, supabase, auth, branchId)
          : await recordWastage(req, supabase, auth, branchId);
      case 'transfer':
        return await createTransfer(req, supabase, auth, branchId);
      case 'transfers':
        return await listTransfers(req, supabase, auth, branchId);
      case 'low-stock':
        return await getLowStock(supabase, auth, branchId);
      default:
        return errorResponse('Unknown inventory action', 404);
    }
  } catch (err) {
    console.error('Inventory error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listItems(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'quantity', 'cost_per_unit', 'category'],
  );

  let query = supabase
    .from('inventory_items')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  const category = url.searchParams.get('category');
  if (category) query = query.eq('category', category);

  const search = url.searchParams.get('search');
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

  const activeOnly = url.searchParams.get('active_only');
  if (activeOnly === 'true') query = query.eq('is_active', true);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ item: data });
}

async function upsertItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.name || !body.unit) return errorResponse('Missing name or unit');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    sku: body.sku ? sanitizeString(body.sku) : null,
    unit: body.unit,
    quantity: body.quantity ?? 0,
    min_quantity: body.min_quantity ?? 0,
    cost_per_unit: body.cost_per_unit ?? 0,
    category: body.category ?? null,
    supplier_id: body.supplier_id ?? null,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(record)
      .eq('id', body.id)
      .eq('branch_id', branchId)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ item: data });
  } else {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(record)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ item: data }, 201);
  }
}

async function deactivateItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: false })
    .eq('id', id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deactivated: true });
}

async function adjustStock(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.inventory_item_id || body.quantity_change === undefined || !body.reason) {
    return errorResponse('Missing inventory_item_id, quantity_change, or reason');
  }

  // Get current quantity
  const { data: item } = await supabase
    .from('inventory_items')
    .select('quantity, cost_per_unit')
    .eq('id', body.inventory_item_id)
    .eq('branch_id', branchId)
    .single();

  if (!item) return errorResponse('Item not found', 404);

  const newQty = item.quantity + body.quantity_change;
  if (newQty < 0) return errorResponse('Adjustment would result in negative stock');

  // Update quantity
  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({ quantity: newQty })
    .eq('id', body.inventory_item_id);

  if (updateError) return errorResponse(updateError.message);

  // Record movement
  const movementType = body.quantity_change > 0 ? 'manual_addition' : 'manual_deduction';
  const { error: movError } = await supabase
    .from('stock_movements')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      inventory_item_id: body.inventory_item_id,
      movement_type: movementType,
      quantity_change: body.quantity_change,
      quantity_before: item.quantity,
      quantity_after: newQty,
      unit_cost: item.cost_per_unit,
      notes: sanitizeString(body.reason),
      performed_by: auth.userId,
      performed_by_name: body.performed_by_name ?? auth.email,
    });

  if (movError) return errorResponse(movError.message);

  return jsonResponse({ new_quantity: newQty });
}

async function listMovements(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('stock_movements')
    .select('*, inventory_items(name, sku)', { count: 'exact' })
    .eq('branch_id', branchId);

  const itemId = url.searchParams.get('inventory_item_id');
  if (itemId) query = query.eq('inventory_item_id', itemId);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function listWastage(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('wastage_records')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function recordWastage(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_wastage')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.inventory_item_id || !body.quantity || !body.reason || !body.wastage_type) {
    return errorResponse('Missing inventory_item_id, quantity, reason, or wastage_type');
  }

  const { data, error } = await supabase.rpc('record_wastage', {
    p_company_id: auth.companyId,
    p_branch_id: branchId,
    p_inventory_item_id: body.inventory_item_id,
    p_quantity: body.quantity,
    p_reason: sanitizeString(body.reason),
    p_wastage_type: body.wastage_type,
    p_recorded_by: auth.userId,
    p_recorded_by_name: body.recorded_by_name ?? auth.email,
    p_notes: body.notes ? sanitizeString(body.notes) : null,
    p_image_url: body.image_url ?? null,
  });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(data, 201);
}

async function createTransfer(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.to_branch_id || !body.items || body.items.length === 0) {
    return errorResponse('Missing to_branch_id or items');
  }

  const { data: transfer, error } = await supabase
    .from('inventory_transfers')
    .insert({
      company_id: auth.companyId,
      from_branch_id: branchId,
      to_branch_id: body.to_branch_id,
      status: 'pending',
      notes: body.notes ?? null,
      initiated_by: auth.userId,
      initiated_by_name: body.initiated_by_name ?? auth.email,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Insert transfer items
  const transferItems = body.items.map((item: any) => ({
    transfer_id: transfer.id,
    inventory_item_id: item.inventory_item_id,
    quantity: item.quantity,
    unit: item.unit ?? 'piece',
  }));

  await supabase.from('inventory_transfer_items').insert(transferItems);

  return jsonResponse({ transfer }, 201);
}

async function listTransfers(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('inventory_transfers')
    .select('*, inventory_transfer_items(*)', { count: 'exact' })
    .or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getLowStock(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .lte('quantity', supabase.rpc ? 0 : 0); // Fallback: we filter in JS

  if (error) return errorResponse(error.message);

  // Filter where quantity <= min_quantity
  const lowStock = (data ?? []).filter((item: any) => item.quantity <= item.min_quantity);

  return jsonResponse({ items: lowStock });
}
