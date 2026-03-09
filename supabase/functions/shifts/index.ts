import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient, requireAuth, hasPermission, resolveBranchId, resolveBranchIdOrAll,
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

    // shift-cash-report supports __all__ branches — handle before branch guard
    if (action === 'shift-cash-report') return await shiftCashReport(req, auth);

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

// ═══════════════════════════════════════════════════════════════════════════
// Shift & Cash Report — revenue or losses per HR shift / date / staff
// ═══════════════════════════════════════════════════════════════════════════

async function shiftCashReport(req: Request, auth: AuthContext) {
  if (!hasPermission(auth, 'manage_shifts') && !hasPermission(auth, 'view_reports'))
    return errorResponse('Forbidden', 403);

  const url = new URL(req.url);
  const branchId = resolveBranchIdOrAll(auth, req);
  const date = url.searchParams.get('date'); // YYYY-MM-DD
  const shiftId = url.searchParams.get('shift_id'); // hr_shifts.id
  const staffId = url.searchParams.get('staff_id'); // profiles.id or 'all'
  const metric = url.searchParams.get('metric') ?? 'revenue'; // revenue | loss

  if (!date) return errorResponse('Missing date');
  if (!shiftId) return errorResponse('Missing shift_id');

  const service = createServiceClient();
  const companyId = auth.companyId!;

  // 1) Load the HR shift to get the time window
  const { data: shift, error: shiftErr } = await service
    .from('hr_shifts')
    .select('id, shift_name, start_time, end_time, branch_id')
    .eq('id', shiftId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (shiftErr) return errorResponse(shiftErr.message);
  if (!shift) return errorResponse('Shift not found', 404);

  // Normalize time — PostgreSQL time type returns HH:MM:SS; avoid double-suffixing
  const normTime = (t: string) => (t.split(':').length >= 3 ? t : `${t}:00`);
  const st = normTime(shift.start_time);
  const et = normTime(shift.end_time);

  // Build datetime range from date + shift times
  const dateFrom = `${date}T${st}.000Z`;
  let dateTo: string;
  // Handle overnight shifts: if end_time <= start_time, end is next day
  if (shift.end_time <= shift.start_time) {
    const nextDay = new Date(date + 'T00:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nd = nextDay.toISOString().slice(0, 10);
    dateTo = `${nd}T${et}.000Z`;
  } else {
    dateTo = `${date}T${et}.000Z`;
  }

  // 2) Find staff assigned to this shift on this date
  let assignQ = service
    .from('shift_assignments')
    .select('staff_id, staff:profiles!inner(id, name)')
    .eq('shift_id', shiftId)
    .eq('assignment_date', date)
    .eq('company_id', companyId);
  if (branchId !== '__all__') assignQ = assignQ.eq('branch_id', branchId);
  const { data: assignments } = await assignQ;
  const assignedStaff: { id: string; name: string }[] = (assignments ?? []).map(
    (a: any) => ({ id: a.staff_id, name: a.staff?.name ?? 'Unknown' }),
  );

  // Determine which staff IDs to query
  const targetStaffIds = staffId && staffId !== 'all'
    ? [staffId]
    : assignedStaff.map((s) => s.id);

  if (targetStaffIds.length === 0) {
    return jsonResponse({
      shift_name: shift.shift_name,
      date,
      metric,
      staff: [],
      summary: { total: 0, order_count: 0 },
      assigned_staff: assignedStaff,
    });
  }

  const bf = (q: any) => branchId === '__all__' ? q : q.eq('branch_id', branchId);

  if (metric === 'revenue') {
    // Revenue = completed orders from internal sources, created by target staff, within shift window
    const internalSources = ['pos', 'phone', 'kitchen', 'bar', 'accommodation', 'other_services'];

    let oq = service
      .from('orders')
      .select('id, total, created_by, created_by_name, status, source, order_number, created_at')
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .in('source', internalSources)
      .in('created_by', targetStaffIds)
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo);
    oq = bf(oq);
    const { data: orders, error: ordErr } = await oq;
    if (ordErr) return errorResponse(ordErr.message);

    // Fetch payment methods for these orders
    const orderIds = (orders ?? []).map((o: any) => o.id);
    let paymentMap = new Map<string, string[]>();
    if (orderIds.length > 0) {
      const { data: payments } = await service
        .from('order_payments')
        .select('order_id, payment_method')
        .eq('status', 'paid')
        .in('order_id', orderIds);
      for (const p of (payments ?? []) as any[]) {
        const existing = paymentMap.get(p.order_id) ?? [];
        existing.push(p.payment_method);
        paymentMap.set(p.order_id, existing);
      }
    }

    // Group by staff
    const staffMap = new Map<string, { name: string; total: number; order_count: number; orders: any[] }>();
    for (const o of (orders ?? []) as any[]) {
      const key = o.created_by;
      let entry = staffMap.get(key);
      if (!entry) {
        entry = { name: o.created_by_name ?? 'Unknown', total: 0, order_count: 0, orders: [] };
        staffMap.set(key, entry);
      }
      const amt = Number(o.total);
      entry.total += amt;
      entry.order_count++;
      entry.orders.push({
        id: o.id,
        order_number: o.order_number,
        total: amt,
        source: o.source,
        status: o.status,
        created_at: o.created_at,
        payment_methods: paymentMap.get(o.id) ?? [],
      });
    }

    const staffResult = [...staffMap.entries()].map(([id, v]) => ({
      staff_id: id,
      staff_name: v.name,
      total: Math.round(v.total * 100) / 100,
      order_count: v.order_count,
      orders: v.orders,
    }));

    const grandTotal = staffResult.reduce((s, r) => s + r.total, 0);
    const grandCount = staffResult.reduce((s, r) => s + r.order_count, 0);

    return jsonResponse({
      shift_name: shift.shift_name,
      date,
      metric: 'revenue',
      staff: staffResult,
      summary: {
        total: Math.round(grandTotal * 100) / 100,
        order_count: grandCount,
      },
      assigned_staff: assignedStaff,
    });
  }

  // ── Losses: wastage recorded during the shift window ──
  let wq = service
    .from('wastage_records')
    .select('id, source, wastage_type, total_value, quantity, notes, created_at, recorded_by, recorded_by_name')
    .eq('company_id', companyId)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo);
  wq = bf(wq);
  // wastage_records may not have recorded_by always; if specific staff requested, filter
  if (staffId && staffId !== 'all') {
    wq = wq.eq('recorded_by', staffId);
  }

  const { data: wastage, error: wErr } = await wq;
  if (wErr) return errorResponse(wErr.message);

  // Group by staff
  const wasteStaffMap = new Map<string, { name: string; total: number; count: number; records: any[] }>();
  for (const w of (wastage ?? []) as any[]) {
    const key = w.recorded_by ?? '__unknown__';
    let entry = wasteStaffMap.get(key);
    if (!entry) {
      entry = { name: w.recorded_by_name ?? 'Unknown', total: 0, count: 0, records: [] };
      wasteStaffMap.set(key, entry);
    }
    const val = Number(w.total_value ?? 0);
    entry.total += val;
    entry.count++;
    entry.records.push({
      id: w.id,
      source: w.source,
      wastage_type: w.wastage_type,
      total_value: val,
      quantity: w.quantity,
      notes: w.notes,
      created_at: w.created_at,
    });
  }

  const wasteResult = [...wasteStaffMap.entries()].map(([id, v]) => ({
    staff_id: id,
    staff_name: v.name,
    total: Math.round(v.total * 100) / 100,
    record_count: v.count,
    records: v.records,
  }));

  const wastageTotal = wasteResult.reduce((s, r) => s + r.total, 0);
  const wastageCount = wasteResult.reduce((s, r) => s + r.record_count, 0);

  return jsonResponse({
    shift_name: shift.shift_name,
    date,
    metric: 'loss',
    staff: wasteResult,
    summary: {
      total: Math.round(wastageTotal * 100) / 100,
      record_count: wastageCount,
    },
    assigned_staff: assignedStaff,
  });
}
