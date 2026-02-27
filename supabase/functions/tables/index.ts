import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
  validatePagination, applyPagination,
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
      case 'list':
        return await listTables(supabase, auth, branchId);
      case 'get':
        return await getTable(req, supabase, auth, branchId);
      case 'upsert':
        return await upsertTable(req, supabase, auth, branchId);
      case 'update-status':
        return await updateTableStatus(req, supabase, auth, branchId);
      case 'assign':
        return await assignTable(req, supabase, auth, branchId);
      case 'layout':
        return await getTableLayout(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown tables action', 404);
    }
  } catch (err) {
    console.error('Tables error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

/* ─── List all tables ─── */
async function listTables(supabase: any, auth: AuthContext, branchId: string) {
  // Use !inner hint on the FK name to disambiguate (orders.table_id, not tables.current_order_id)
  const { data, error } = await supabase
    .from('tables')
    .select('*, orders!orders_table_id_fkey(id, order_number, total, status, created_at)')
    .eq('branch_id', branchId)
    .order('table_number', { ascending: true });

  if (error) {
    // Fallback: if the FK-hint query fails, fetch without orders join
    const { data: fallback, error: fbErr } = await supabase
      .from('tables')
      .select('*')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: true });
    if (fbErr) return errorResponse(fbErr.message);
    return jsonResponse({ tables: fallback ?? [] });
  }

  const tables = (data ?? []).map((t: any) => {
    const currentOrder = t.current_order_id
      ? t.orders?.find((o: any) => o.id === t.current_order_id)
      : null;
    return { ...t, current_order: currentOrder, orders: undefined };
  });

  return jsonResponse({ tables });
}

/* ─── Get single table ─── */
async function getTable(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing table id');

  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ table: data });
}

/* ─── Create / update table ─── */
async function upsertTable(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_tables')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const tableNumber = body.table_number ?? body.number;
  const name = body.name;

  if (!tableNumber || !name) return errorResponse('Missing number or name');

  const record: Record<string, unknown> = {
    company_id: auth.companyId,
    branch_id: branchId,
    table_number: String(tableNumber),
    name,
    capacity: body.capacity ?? 4,
    section: body.section ?? 'Main',
    status: body.status ?? 'available',
    position_x: body.position_x ?? 0,
    position_y: body.position_y ?? 0,
    is_active: body.is_active ?? true,
  };

  // Optional fields
  if (body.image_url !== undefined) record.image_url = body.image_url;
  if (body.notes !== undefined) record.notes = body.notes;

  if (body.id) {
    const { data, error } = await supabase
      .from('tables').update(record).eq('id', body.id).eq('branch_id', branchId).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ table: data });
  } else {
    // Check if table_number already exists for this branch
    const { data: existing } = await supabase
      .from('tables')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('branch_id', branchId)
      .eq('table_number', String(tableNumber))
      .maybeSingle();

    if (existing) {
      // Update the existing table instead of inserting a duplicate
      const { data, error } = await supabase
        .from('tables').update(record).eq('id', existing.id).select().single();
      if (error) return errorResponse(error.message);
      return jsonResponse({ table: data });
    }

    const { data, error } = await supabase
      .from('tables').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ table: data }, 201);
  }
}

/* ─── Update table status ─── */
async function updateTableStatus(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  const tableId = body.table_id ?? body.id;
  if (!tableId || !body.status) return errorResponse('Missing table_id or status');

  const validStatuses = ['available', 'occupied', 'reserved', 'dirty', 'maintenance'];
  if (!validStatuses.includes(body.status)) {
    return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const updates: Record<string, unknown> = { status: body.status };
  if (body.status === 'available') {
    updates.current_order_id = null;
    updates.assigned_customer_name = null;
    updates.num_people = null;
  }

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ table: data });
}

/* ─── Assign table to customer ─── */
async function assignTable(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  const tableId = body.table_id;
  if (!tableId) return errorResponse('Missing table_id');

  const status = body.status ?? 'occupied';
  const validStatuses = ['occupied', 'reserved', 'dirty', 'maintenance'];
  if (!validStatuses.includes(status)) {
    return errorResponse(`Invalid assign status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate num_people against capacity
  if (body.num_people) {
    const { data: tbl } = await supabase
      .from('tables').select('capacity').eq('id', tableId).single();
    if (tbl && body.num_people > tbl.capacity) {
      return errorResponse(`Number of people (${body.num_people}) exceeds table capacity (${tbl.capacity})`);
    }
  }

  const updates: Record<string, unknown> = {
    status,
    assigned_customer_name: body.customer_name ?? null,
    num_people: body.num_people ?? null,
  };

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ table: data });
}

/* ─── Layout – grouped by status for tabs (paginated per status) ─── */
async function getTableLayout(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status') ?? '';
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  // Get counts per status (always lightweight)
  const { data: allTables, error: cntErr } = await supabase
    .from('tables')
    .select('status')
    .eq('branch_id', branchId)
    .eq('is_active', true);

  if (cntErr) return errorResponse(cntErr.message);

  const statusOrder = ['available', 'occupied', 'reserved', 'dirty', 'maintenance'];
  const countMap: Record<string, number> = {};
  for (const s of statusOrder) countMap[s] = 0;
  for (const t of allTables ?? []) {
    if (countMap[t.status] !== undefined) countMap[t.status]++;
    else countMap[t.status] = 1;
  }

  // Fetch paginated tables for the requested status
  const targetStatus = statusFilter && statusOrder.includes(statusFilter) ? statusFilter : 'available';
  let query = supabase
    .from('tables')
    .select('id, table_number, name, capacity, section, status, image_url, notes, assigned_customer_name, num_people, position_x, position_y, current_order_id, is_active', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .eq('status', targetStatus);

  query = applyPagination(query, page, pageSize, 'table_number', true);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  // Build sections summary with counts, only the requested status gets actual tables
  const sections = statusOrder.map((s) => ({
    section: s,
    tables: s === targetStatus ? (data ?? []) : [],
    available: s === 'available' ? countMap['available'] : 0,
    total: countMap[s] ?? 0,
  }));

  return jsonResponse({
    sections,
    total_tables: (allTables ?? []).length,
    available: countMap['available'] ?? 0,
    occupied: countMap['occupied'] ?? 0,
    page,
    pageSize,
    totalForStatus: count ?? 0,
  });
}
