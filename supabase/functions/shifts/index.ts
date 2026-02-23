import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
  sanitizeString,
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
      case 'open':
        return await openShift(req, supabase, auth, branchId);
      case 'close':
        return await closeShift(req, supabase, auth, branchId);
      case 'current':
        return await getCurrentShift(supabase, auth, branchId);
      case 'list':
        return await listShifts(req, supabase, auth, branchId);
      case 'get':
        return await getShift(req, supabase, auth, branchId);
      case 'cash-in':
      case 'cash-out':
        return await cashAction(req, supabase, auth, action);
      case 'drawer-logs':
        return await getDrawerLogs(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown shifts action', 404);
    }
  } catch (err) {
    console.error('Shifts error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function openShift(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_shifts')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (body.opening_cash === undefined) return errorResponse('Missing opening_cash');

  const { data, error } = await supabase.rpc('open_shift', {
    p_company_id: auth.companyId,
    p_branch_id: branchId,
    p_opened_by: auth.userId,
    p_opened_by_name: body.opened_by_name ?? auth.email,
    p_opening_cash: body.opening_cash,
  });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(data, 201);
}

async function closeShift(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_shifts')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.shift_id || body.closing_cash === undefined) {
    return errorResponse('Missing shift_id or closing_cash');
  }

  const { data, error } = await supabase.rpc('close_shift', {
    p_shift_id: body.shift_id,
    p_closed_by: auth.userId,
    p_closed_by_name: body.closed_by_name ?? auth.email,
    p_closing_cash: body.closing_cash,
    p_notes: body.notes ?? null,
  });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(data);
}

async function getCurrentShift(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) return errorResponse(error.message);
  return jsonResponse({ shift: data });
}

async function listShifts(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size')) || 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('shifts')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return errorResponse(error.message);
  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getShift(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing shift id');

  const { data, error } = await supabase
    .from('shifts')
    .select('*, cash_drawer_logs(*)')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ shift: data });
}

async function cashAction(req: Request, supabase: any, auth: AuthContext, action: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_shifts')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.shift_id || !body.amount || !body.reason) {
    return errorResponse('Missing shift_id, amount, or reason');
  }

  const drawerAction = action === 'cash-in' ? 'cash_in' : 'cash_out';
  const { data, error } = await supabase.rpc('record_cash_drawer_action', {
    p_shift_id: body.shift_id,
    p_action: drawerAction,
    p_amount: body.amount,
    p_reason: sanitizeString(body.reason),
    p_performed_by: auth.userId,
    p_performed_by_name: body.performed_by_name ?? auth.email,
  });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(data);
}

async function getDrawerLogs(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const shiftId = url.searchParams.get('shift_id');
  if (!shiftId) return errorResponse('Missing shift_id');

  const { data, error } = await supabase
    .from('cash_drawer_logs')
    .select('*')
    .eq('shift_id', shiftId)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ logs: data });
}
