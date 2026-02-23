import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
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
      case 'layout':
        return await getTableLayout(supabase, auth, branchId);
      default:
        return errorResponse('Unknown tables action', 404);
    }
  } catch (err) {
    console.error('Tables error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listTables(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('tables')
    .select('*, orders(id, order_number, total, status, created_at)')
    .eq('branch_id', branchId)
    .order('number', { ascending: true });

  if (error) return errorResponse(error.message);

  // Attach current order if occupied
  const tables = (data ?? []).map((t: any) => {
    const currentOrder = t.current_order_id
      ? t.orders?.find((o: any) => o.id === t.current_order_id)
      : null;
    return { ...t, current_order: currentOrder, orders: undefined };
  });

  return jsonResponse({ tables });
}

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

async function upsertTable(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_tables')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.number || !body.name) return errorResponse('Missing number or name');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    number: body.number,
    name: body.name,
    capacity: body.capacity ?? 4,
    section: body.section ?? 'Indoor',
    status: body.status ?? 'available',
    position_x: body.position_x ?? 0,
    position_y: body.position_y ?? 0,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('tables').update(record).eq('id', body.id).eq('branch_id', branchId).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ table: data });
  } else {
    const { data, error } = await supabase
      .from('tables').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ table: data }, 201);
  }
}

async function updateTableStatus(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.id || !body.status) return errorResponse('Missing id or status');

  const validStatuses = ['available', 'occupied', 'reserved', 'dirty', 'maintenance'];
  if (!validStatuses.includes(body.status)) {
    return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const updates: Record<string, unknown> = { status: body.status };
  if (body.status === 'available') {
    updates.current_order_id = null;
  }

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', body.id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ table: data });
}

async function getTableLayout(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('tables')
    .select('id, number, name, capacity, section, status, position_x, position_y, current_order_id, is_active')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('number', { ascending: true });

  if (error) return errorResponse(error.message);

  // Group by section
  const sections = new Map<string, any[]>();
  for (const table of data ?? []) {
    const sec = table.section ?? 'Default';
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(table);
  }

  return jsonResponse({
    layout: Object.fromEntries(sections),
    total_tables: data?.length ?? 0,
    available: data?.filter((t: any) => t.status === 'available').length ?? 0,
    occupied: data?.filter((t: any) => t.status === 'occupied').length ?? 0,
  });
}
