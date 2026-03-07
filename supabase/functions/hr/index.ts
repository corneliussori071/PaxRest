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

    // Permission helper: check if user has any of the given permissions
    const hasAny = (...perms: string[]) => {
      if (auth.role === 'owner') return true;
      return perms.some((p) => auth.permissions.includes(p));
    };

    // Self-service endpoints need any HR permission
    const anyHrPerm = hasAny(
      'manage_hr',
      'hr_staff', 'hr_staff_view',
      'hr_attendance', 'hr_attendance_view',
      'hr_shifts', 'hr_shifts_view',
      'hr_payroll', 'hr_payroll_view',
      'hr_leave', 'hr_leave_view',
      'hr_performance',
    );
    if (!anyHrPerm) return errorResponse('Forbidden', 403);

    switch (action) {
      // Self-service (restricted) endpoints
      case 'my-clock-status':    return await myClockStatus(req, auth);
      case 'clock-in':           return await clockIn(req, auth);
      case 'clock-out':          return await clockOut(req, auth);
      case 'my-attendance':      return await myAttendance(req, auth);
      case 'my-schedule':        return await mySchedule(req, auth);
      case 'my-payroll':         return await myPayroll(req, auth);
      case 'my-leave-requests':  return await myLeaveRequests(req, auth);
      case 'my-request-leave':   return await myRequestLeave(req, auth);

      // Staff HR Profiles (full access)
      case 'list-staff': {
        if (!hasAny('manage_hr', 'hr_staff', 'hr_staff_view')) return errorResponse('Forbidden', 403);
        return await listStaffHr(req, auth);
      }
      case 'get-staff': {
        if (!hasAny('manage_hr', 'hr_staff', 'hr_staff_view')) return errorResponse('Forbidden', 403);
        return await getStaffHr(req, auth);
      }
      case 'upsert-staff': {
        if (!hasAny('manage_hr', 'hr_staff')) return errorResponse('Forbidden', 403);
        return await upsertStaffHr(req, auth);
      }
      case 'generate-staff-code': {
        if (!hasAny('manage_hr', 'hr_staff')) return errorResponse('Forbidden', 403);
        return await generateStaffCode(req, auth);
      }

      // Attendance (full access)
      case 'list-attendance': {
        if (!hasAny('manage_hr', 'hr_attendance', 'hr_attendance_view')) return errorResponse('Forbidden', 403);
        return await listAttendance(req, auth);
      }
      case 'upsert-attendance': {
        if (!hasAny('manage_hr', 'hr_attendance')) return errorResponse('Forbidden', 403);
        return await upsertAttendance(req, auth);
      }
      case 'delete-attendance': {
        if (!hasAny('manage_hr', 'hr_attendance')) return errorResponse('Forbidden', 403);
        return await deleteAttendance(req, auth);
      }

      // HR Shifts (full access)
      case 'list-shifts': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await listHrShifts(req, auth);
      }
      case 'create-shift': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await createHrShift(req, auth);
      }
      case 'update-shift': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await updateHrShift(req, auth);
      }
      case 'delete-shift': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await deleteHrShift(req, auth);
      }

      // Shift Assignments
      case 'list-assignments': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await listAssignments(req, auth);
      }
      case 'create-assignment': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await createAssignment(req, auth);
      }
      case 'delete-assignment': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await deleteAssignment(req, auth);
      }

      // Payroll
      case 'list-payroll-staff': {
        if (!hasAny('manage_hr', 'hr_payroll', 'hr_payroll_view')) return errorResponse('Forbidden', 403);
        return await listPayrollStaff(req, auth);
      }
      case 'list-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll', 'hr_payroll_view')) return errorResponse('Forbidden', 403);
        return await listPayroll(req, auth);
      }
      case 'get-payroll-detail': {
        if (!hasAny('manage_hr', 'hr_payroll', 'hr_payroll_view')) return errorResponse('Forbidden', 403);
        return await getPayrollDetail(req, auth);
      }
      case 'generate-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await generatePayroll(req, auth);
      }
      case 'validate-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await validatePayroll(req, auth);
      }
      case 'issue-payment': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await issuePayment(req, auth);
      }
      case 'pay-all-validated': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await payAllValidated(req, auth);
      }
      case 'adjust-pay': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await adjustPay(req, auth);
      }
      case 'remove-from-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await removeFromPayroll(req, auth);
      }
      case 'suspend-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await suspendPayroll(req, auth);
      }
      case 'unsuspend-payroll': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await unsuspendPayroll(req, auth);
      }
      case 'payroll-dashboard': {
        if (!hasAny('manage_hr', 'hr_payroll', 'hr_payroll_view')) return errorResponse('Forbidden', 403);
        return await payrollDashboard(req, auth);
      }
      case 'get-payroll-settings': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await getPayrollSettings(req, auth);
      }
      case 'save-payroll-settings': {
        if (!hasAny('manage_hr', 'hr_payroll')) return errorResponse('Forbidden', 403);
        return await savePayrollSettings(req, auth);
      }

      // Leave Types
      case 'list-leave-types': {
        if (!hasAny('manage_hr', 'hr_leave', 'hr_leave_view')) return errorResponse('Forbidden', 403);
        return await listLeaveTypes(req, auth);
      }
      case 'upsert-leave-type': {
        if (!hasAny('manage_hr', 'hr_leave')) return errorResponse('Forbidden', 403);
        return await upsertLeaveType(req, auth);
      }

      // Leave Requests
      case 'list-leave-requests': {
        if (!hasAny('manage_hr', 'hr_leave', 'hr_leave_view')) return errorResponse('Forbidden', 403);
        return await listLeaveRequests(req, auth);
      }
      case 'create-leave-request': {
        if (!hasAny('manage_hr', 'hr_leave')) return errorResponse('Forbidden', 403);
        return await createLeaveRequest(req, auth);
      }
      case 'review-leave': {
        if (!hasAny('manage_hr', 'hr_leave')) return errorResponse('Forbidden', 403);
        return await reviewLeaveRequest(req, auth);
      }

      // Performance Records
      case 'list-performance': {
        if (!hasAny('manage_hr', 'hr_performance')) return errorResponse('Forbidden', 403);
        return await listPerformance(req, auth);
      }
      case 'create-performance': {
        if (!hasAny('manage_hr', 'hr_performance')) return errorResponse('Forbidden', 403);
        return await createPerformance(req, auth);
      }
      case 'delete-performance': {
        if (!hasAny('manage_hr', 'hr_performance')) return errorResponse('Forbidden', 403);
        return await deletePerformance(req, auth);
      }

      // Stations
      case 'list-stations': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await listStations(req, auth);
      }
      case 'get-station': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await getStation(req, auth);
      }
      case 'create-station': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await createStation(req, auth);
      }
      case 'update-station': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await updateStation(req, auth);
      }
      case 'delete-station': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await deleteStation(req, auth);
      }

      // Schedules
      case 'list-schedules': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await listSchedules(req, auth);
      }
      case 'get-schedule-detail': {
        if (!hasAny('manage_hr', 'hr_shifts', 'hr_shifts_view')) return errorResponse('Forbidden', 403);
        return await getScheduleDetail(req, auth);
      }
      case 'generate-schedule': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await generateSchedule(req, auth);
      }
      case 'update-assignment': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await updateAssignment(req, auth);
      }
      case 'delete-schedule': {
        if (!hasAny('manage_hr', 'hr_shifts')) return errorResponse('Forbidden', 403);
        return await deleteSchedule(req, auth);
      }

      default:
        return errorResponse('Unknown HR action', 404);
    }
  } catch (err) {
    console.error('HR error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Staff HR Profiles
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listStaffHr(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'staff_code', 'hire_date', 'base_pay'],
  );
  const branchId = resolveBranchId(auth, req);
  const search = url.searchParams.get('search');
  const branchFilter = url.searchParams.get('branch_filter');
  const service = createServiceClient();

  // Join with profiles to get name/email
  let query = service
    .from('staff_hr_profiles')
    .select('*, profile:profiles!inner(id, name, email, phone, role, is_active, avatar_url, branch_ids)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  if (branchFilter === '__none__') {
    // Will filter in-memory for empty branch_ids
  } else if (branchId) {
    query = query.contains('profile.branch_ids', [branchId]);
  }

  if (search) {
    query = query.or(`staff_code.ilike.%${search}%,profile.name.ilike.%${search}%`, { referencedTable: undefined });
  }

  if (branchFilter !== '__none__') {
    query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
    const { data, count, error } = await query;
    if (error) return errorResponse(error.message);
    return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
  }

  // For __none__ filter, fetch all then filter in-memory for empty branch_ids
  const { data: allData, error: allErr } = await query;
  if (allErr) return errorResponse(allErr.message);
  const filtered = (allData ?? []).filter((s: any) => !s.profile?.branch_ids || s.profile.branch_ids.length === 0);
  const startIdx = (page - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);
  return jsonResponse({ items: pageItems, total: filtered.length, page, page_size: pageSize, total_pages: Math.ceil(filtered.length / pageSize) });
}

async function getStaffHr(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get('profile_id');
  if (!profileId) return errorResponse('Missing profile_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('staff_hr_profiles')
    .select('*, profile:profiles!inner(id, name, email, phone, role, is_active, avatar_url)')
    .eq('profile_id', profileId)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (error) return errorResponse(error.message);
  return jsonResponse({ staff: data });
}

async function upsertStaffHr(req: Request, auth: AuthContext) {
  if (req.method !== 'POST' && req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.profile_id) return errorResponse('Missing profile_id');

  const service = createServiceClient();
  const record: Record<string, unknown> = {
    profile_id: body.profile_id,
    company_id: auth.companyId,
  };

  if (body.staff_code !== undefined) record.staff_code = sanitizeString(body.staff_code, 20);
  if (body.date_of_birth !== undefined) record.date_of_birth = body.date_of_birth;
  if (body.gender !== undefined) record.gender = body.gender;
  if (body.address !== undefined) record.address = sanitizeString(body.address, 500);
  if (body.emergency_contact_name !== undefined) record.emergency_contact_name = sanitizeString(body.emergency_contact_name, 200);
  if (body.emergency_contact_phone !== undefined) record.emergency_contact_phone = body.emergency_contact_phone;
  if (body.employment_type !== undefined) record.employment_type = body.employment_type;
  if (body.salary_type !== undefined) record.salary_type = body.salary_type;
  if (body.base_pay !== undefined) record.base_pay = body.base_pay;
  if (body.allowances !== undefined) record.allowances = body.allowances;
  if (body.tax_percentage !== undefined) record.tax_percentage = body.tax_percentage;
  if (body.overtime_rate !== undefined) record.overtime_rate = body.overtime_rate;
  if (body.bank_account !== undefined) record.bank_account = body.bank_account;
  if (body.hire_date !== undefined) record.hire_date = body.hire_date;
  if (body.employment_end_date !== undefined) record.employment_end_date = body.employment_end_date || null;
  if (body.hourly_rate !== undefined) record.hourly_rate = body.hourly_rate;
  if (body.retirement_date !== undefined) record.retirement_date = body.retirement_date || null;
  if (body.payout_method !== undefined) record.payout_method = body.payout_method;
  if (body.bank_name !== undefined) record.bank_name = body.bank_name;
  if (body.account_type !== undefined) record.account_type = body.account_type;

  record.updated_at = new Date().toISOString();

  const { data, error } = await service
    .from('staff_hr_profiles')
    .upsert(record, { onConflict: 'profile_id,company_id' })
    .select('*, profile:profiles!inner(id, name, email, phone, role, is_active)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ staff: data });
}

async function generateStaffCode(_req: Request, auth: AuthContext) {
  const service = createServiceClient();
  const { data, error } = await service
    .from('staff_hr_profiles')
    .select('staff_code')
    .eq('company_id', auth.companyId)
    .not('staff_code', 'is', null)
    .order('staff_code', { ascending: false })
    .limit(1);

  if (error) return errorResponse(error.message);

  let nextNum = 1;
  if (data && data.length > 0 && data[0].staff_code) {
    const match = data[0].staff_code.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  const code = `STAFF-${String(nextNum).padStart(4, '0')}`;
  return jsonResponse({ code });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Attendance
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listAttendance(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['date', 'created_at', 'clock_in', 'total_hours'],
  );
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('attendance_records')
    .select('*, staff:profiles!inner(id, name, email, avatar_url)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  if (branchId) query = query.eq('branch_id', branchId);

  const staffId = url.searchParams.get('staff_id');
  if (staffId) query = query.eq('staff_id', staffId);

  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const search = url.searchParams.get('search');
  if (search) query = query.ilike('staff.name', `%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function upsertAttendance(req: Request, auth: AuthContext) {
  if (req.method !== 'POST' && req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id || !body.date) return errorResponse('Missing staff_id or date');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const record: Record<string, unknown> = {
    company_id: auth.companyId,
    branch_id: branchId,
    staff_id: body.staff_id,
    date: body.date,
  };
  if (body.id) record.id = body.id;
  if (body.shift_id !== undefined) record.shift_id = body.shift_id;
  if (body.clock_in !== undefined) record.clock_in = body.clock_in;
  if (body.clock_out !== undefined) record.clock_out = body.clock_out;
  if (body.break_minutes !== undefined) record.break_minutes = body.break_minutes;
  if (body.total_hours !== undefined) record.total_hours = body.total_hours;
  if (body.overtime_hours !== undefined) record.overtime_hours = body.overtime_hours;
  if (body.status !== undefined) record.status = body.status;
  if (body.notes !== undefined) record.notes = sanitizeString(body.notes ?? '', 500);
  record.updated_at = new Date().toISOString();

  const { data, error } = await service
    .from('attendance_records')
    .upsert(record, { onConflict: 'staff_id,date' })
    .select('*, staff:profiles!inner(id, name, email)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ record: data });
}

async function deleteAttendance(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const { error } = await service
    .from('attendance_records')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HR Shifts
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listHrShifts(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'shift_name', 'start_time'],
  );
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('hr_shifts')
    .select('*', { count: 'exact' })
    .eq('company_id', auth.companyId);

  if (branchId) query = query.eq('branch_id', branchId);

  const search = url.searchParams.get('search');
  if (search) query = query.ilike('shift_name', `%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function createHrShift(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.shift_name || !body.start_time || !body.end_time) return errorResponse('Missing required fields');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const { data, error } = await service
    .from('hr_shifts')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      shift_name: sanitizeString(body.shift_name, 100),
      start_time: body.start_time,
      end_time: body.end_time,
      max_staff: body.max_staff ?? 5,
      break_duration: body.break_duration ?? 0,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ shift: data });
}

async function updateHrShift(req: Request, auth: AuthContext) {
  if (req.method !== 'PUT' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.shift_name) updates.shift_name = sanitizeString(body.shift_name, 100);
  if (body.start_time) updates.start_time = body.start_time;
  if (body.end_time) updates.end_time = body.end_time;
  if (body.max_staff !== undefined) updates.max_staff = body.max_staff;
  if (body.break_duration !== undefined) updates.break_duration = body.break_duration;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const service = createServiceClient();
  const { data, error } = await service
    .from('hr_shifts')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ shift: data });
}

async function deleteHrShift(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const { error } = await service
    .from('hr_shifts')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Shift Assignments
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listAssignments(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'assignment_date'],
  );
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('shift_assignments')
    .select('*, staff:profiles!inner(id, name, email, avatar_url), shift:hr_shifts!inner(id, shift_name, start_time, end_time)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  if (branchId) query = query.eq('branch_id', branchId);

  const date = url.searchParams.get('date');
  if (date) query = query.eq('assignment_date', date);

  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  if (dateFrom) query = query.gte('assignment_date', dateFrom);
  if (dateTo) query = query.lte('assignment_date', dateTo);

  const staffId = url.searchParams.get('staff_id');
  if (staffId) query = query.eq('staff_id', staffId);

  const shiftId = url.searchParams.get('shift_id');
  if (shiftId) query = query.eq('shift_id', shiftId);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function createAssignment(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id || !body.shift_id || !body.assignment_date) return errorResponse('Missing required fields');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const { data, error } = await service
    .from('shift_assignments')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      staff_id: body.staff_id,
      shift_id: body.shift_id,
      assignment_date: body.assignment_date,
      station: body.station ? sanitizeString(body.station, 100) : null,
      notes: body.notes ? sanitizeString(body.notes, 500) : null,
    })
    .select('*, staff:profiles!inner(id, name, email), shift:hr_shifts!inner(id, shift_name, start_time, end_time)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ assignment: data });
}

async function deleteAssignment(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const { error } = await service
    .from('shift_assignments')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// Payroll
// ===============================================================================

async function listPayrollStaff(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'staff_code', 'base_pay', 'hourly_rate'],
  );
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();
  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');
  const statusFilter = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const branchFilter = url.searchParams.get('branch_filter');

  // Fetch all HR profiles (non-suspended by default)
  let hrQuery = service
    .from('staff_hr_profiles')
    .select('*, profile:profiles!inner(id, name, email, avatar_url, branch_ids)', { count: 'exact' })
    .eq('company_id', auth.companyId)
    .eq('payroll_suspended', false);
  if (search) hrQuery = hrQuery.ilike('profile.name', `%${search}%`);
  const { data: allStaff, count: totalCount, error: hrErr } = await hrQuery;
  if (hrErr) return errorResponse(hrErr.message);

  // Filter by branch
  let filtered = (allStaff ?? []);
  if (branchFilter === '__none__') {
    // Global staff: those with empty or null branch_ids
    filtered = filtered.filter((s: any) => !s.profile?.branch_ids || s.profile.branch_ids.length === 0);
  } else if (branchId) {
    filtered = filtered.filter((s: any) => s.profile?.branch_ids?.includes(branchId));
  }

  // Get station map
  const staffIds = filtered.map((s: any) => s.profile_id);
  let stationMap: Record<string, string> = {};
  if (staffIds.length > 0) {
    const { data: stationStaff } = await service
      .from('hr_station_staff')
      .select('staff_id, station:hr_stations!inner(station_name)')
      .in('staff_id', staffIds);
    for (const ss of stationStaff ?? []) stationMap[ss.staff_id] = (ss as any).station?.station_name ?? '';
  }

  // For each staff, compute pending validation balance from attendance in the period
  const now = new Date();
  const pStart = periodStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const pEnd = periodEnd || now.toISOString().slice(0, 10);

  // Batch fetch attendance, payroll records, and adjustments for all staff
  let attData: any[] = [];
  let prData: any[] = [];
  let adjData: any[] = [];
  if (staffIds.length > 0) {
    const { data: att } = await service
      .from('attendance_records')
      .select('staff_id, date, total_hours, overtime_hours, status')
      .eq('company_id', auth.companyId)
      .in('staff_id', staffIds)
      .gte('date', pStart)
      .lte('date', pEnd);
    attData = att ?? [];

    const { data: pr } = await service
      .from('payroll_records')
      .select('staff_id, status, net_pay, gross_pay, tax, base_pay, overtime_pay')
      .eq('company_id', auth.companyId)
      .in('staff_id', staffIds)
      .gte('period_start', pStart)
      .lte('period_end', pEnd);
    prData = pr ?? [];

    const { data: adj } = await service
      .from('payroll_adjustments')
      .select('staff_id, adjustment_type, amount')
      .eq('company_id', auth.companyId)
      .in('staff_id', staffIds);
    adjData = adj ?? [];
  }

  // Group by staff
  const attByStaff: Record<string, any[]> = {};
  for (const a of attData) { (attByStaff[a.staff_id] ??= []).push(a); }
  const prByStaff: Record<string, any[]> = {};
  for (const p of prData) { (prByStaff[p.staff_id] ??= []).push(p); }
  const adjByStaff: Record<string, any[]> = {};
  for (const a of adjData) { (adjByStaff[a.staff_id] ??= []).push(a); }

  const enriched = filtered.map((s: any) => {
    const sid = s.profile_id;
    const att = attByStaff[sid] ?? [];
    const records = prByStaff[sid] ?? [];
    const adjustments = adjByStaff[sid] ?? [];
    const hourlyRate = Number(s.hourly_rate) || 0;
    const baseRate = Number(s.base_pay) || 0;

    // Calculate pending validation balance from clock-in/out hours
    const workedHours = att.reduce((sum: number, a: any) => sum + (Number(a.total_hours) || 0), 0);
    const overtimeHours = att.reduce((sum: number, a: any) => sum + (Number(a.overtime_hours) || 0), 0);
    const daysWorked = att.filter((a: any) => a.status === 'present').length;

    let pendingBalance = 0;
    if (s.salary_type === 'hourly') {
      pendingBalance = workedHours * (hourlyRate || baseRate);
    } else if (s.salary_type === 'daily') {
      pendingBalance = daysWorked * (hourlyRate || baseRate);
    } else {
      pendingBalance = baseRate; // monthly
    }
    // Add overtime
    pendingBalance += overtimeHours * (Number(s.overtime_rate) || 0);
    // Add allowances
    pendingBalance += Number(s.allowances) || 0;
    // Deduct tax estimate
    const taxEst = pendingBalance * (Number(s.tax_percentage) || 0) / 100;
    pendingBalance -= taxEst;

    // Apply adjustments
    let adjTotal = 0;
    for (const adj of adjustments) {
      if (adj.adjustment_type === 'credit') adjTotal += Number(adj.amount);
      else adjTotal -= Number(adj.amount);
    }
    pendingBalance += adjTotal;

    // Subtract already paid amounts
    const paidAmount = records
      .filter((r: any) => r.status === 'paid')
      .reduce((sum: number, r: any) => sum + (Number(r.net_pay) || 0), 0);
    pendingBalance -= paidAmount;

    // Get latest payroll record status for this period
    const latestRecord = records.sort((a: any, b: any) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    )[0];

    return {
      staff_id: sid,
      staff: s.profile,
      staff_code: s.staff_code,
      salary_type: s.salary_type,
      hourly_rate: hourlyRate,
      base_rate: baseRate,
      station_name: stationMap[sid] ?? null,
      payroll_suspended: s.payroll_suspended,
      pending_validation_balance: Math.round(Math.max(pendingBalance, 0) * 100) / 100,
      worked_hours: Math.round(workedHours * 100) / 100,
      days_worked: daysWorked,
      latest_status: latestRecord?.status ?? null,
      latest_record_id: latestRecord?.id ?? null,
      total_paid: Math.round(paidAmount * 100) / 100,
    };
  });

  // Apply status filter on the enriched data
  let result = enriched;
  if (statusFilter) {
    result = enriched.filter((s: any) => s.latest_status === statusFilter);
  }

  // Manual pagination (since we enriched in-memory)
  const startIdx = (page - 1) * pageSize;
  const pageItems = result.slice(startIdx, startIdx + pageSize);

  return jsonResponse({
    items: pageItems,
    total: result.length,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(result.length / pageSize),
    period_start: pStart,
    period_end: pEnd,
  });
}

async function payrollDashboard(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();
  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');
  const branchFilter = url.searchParams.get('branch_filter');
  const now = new Date();
  const pStart = periodStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const pEnd = periodEnd || now.toISOString().slice(0, 10);

  // Total staff on payroll (non-suspended HR profiles)
  let staffQuery = service
    .from('staff_hr_profiles')
    .select('profile_id, profile:profiles!inner(branch_ids)', { count: 'exact' })
    .eq('company_id', auth.companyId)
    .eq('payroll_suspended', false);
  const { data: staffData, count: staffCount } = await staffQuery;
  let filteredStaff = staffData ?? [];
  if (branchFilter === '__none__') {
    filteredStaff = filteredStaff.filter((s: any) => !s.profile?.branch_ids || s.profile.branch_ids.length === 0);
  } else if (branchId) {
    filteredStaff = filteredStaff.filter((s: any) => s.profile?.branch_ids?.includes(branchId));
  }
  const totalStaff = filteredStaff.length;

  // Payroll records for the period
  const filteredStaffIds = filteredStaff.map((s: any) => s.profile_id);
  let prQuery = service
    .from('payroll_records')
    .select('net_pay, tax, gross_pay, status, staff_id')
    .eq('company_id', auth.companyId)
    .gte('period_start', pStart)
    .lte('period_end', pEnd);
  if (branchId) prQuery = prQuery.eq('branch_id', branchId);
  const { data: prData } = await prQuery;
  const records = prData ?? [];

  const totalPaid = records
    .filter((r: any) => r.status === 'paid')
    .reduce((s: number, r: any) => s + (Number(r.net_pay) || 0), 0);
  const totalValidated = records
    .filter((r: any) => r.status === 'validated')
    .reduce((s: number, r: any) => s + (Number(r.net_pay) || 0), 0);
  const totalTaxDeductions = records
    .reduce((s: number, r: any) => s + (Number(r.tax) || 0), 0);

  // Compute pending validation from attendance like listPayrollStaff does
  let totalPendingValidation = 0;
  if (filteredStaffIds.length > 0) {
    // Get HR profiles for salary info
    const { data: hrProfiles } = await service
      .from('staff_hr_profiles')
      .select('profile_id, salary_type, hourly_rate, base_pay, overtime_rate, allowances, tax_percentage')
      .eq('company_id', auth.companyId)
      .in('profile_id', filteredStaffIds)
      .eq('payroll_suspended', false);

    // Get attendance for the period
    const { data: attData } = await service
      .from('attendance_records')
      .select('staff_id, total_hours, overtime_hours, status')
      .eq('company_id', auth.companyId)
      .in('staff_id', filteredStaffIds)
      .gte('date', pStart)
      .lte('date', pEnd);

    // Get adjustments
    const { data: adjData } = await service
      .from('payroll_adjustments')
      .select('staff_id, adjustment_type, amount')
      .eq('company_id', auth.companyId)
      .in('staff_id', filteredStaffIds);

    const attByStaff: Record<string, any[]> = {};
    for (const a of attData ?? []) { (attByStaff[a.staff_id] ??= []).push(a); }
    const prByStaff: Record<string, any[]> = {};
    for (const r of records) { (prByStaff[r.staff_id] ??= []).push(r); }
    const adjByStaff: Record<string, any[]> = {};
    for (const a of adjData ?? []) { (adjByStaff[a.staff_id] ??= []).push(a); }

    for (const hp of hrProfiles ?? []) {
      const sid = hp.profile_id;
      const att = attByStaff[sid] ?? [];
      const paidRecs = prByStaff[sid] ?? [];
      const adjustments = adjByStaff[sid] ?? [];

      const workedHours = att.reduce((sum: number, a: any) => sum + (Number(a.total_hours) || 0), 0);
      const overtimeHours = att.reduce((sum: number, a: any) => sum + (Number(a.overtime_hours) || 0), 0);
      const daysWorked = att.filter((a: any) => a.status === 'present').length;

      let pendingBalance = 0;
      if (hp.salary_type === 'hourly') pendingBalance = workedHours * (Number(hp.hourly_rate) || Number(hp.base_pay) || 0);
      else if (hp.salary_type === 'daily') pendingBalance = daysWorked * (Number(hp.hourly_rate) || Number(hp.base_pay) || 0);
      else pendingBalance = Number(hp.base_pay) || 0;

      pendingBalance += overtimeHours * (Number(hp.overtime_rate) || 0);
      pendingBalance += Number(hp.allowances) || 0;
      pendingBalance -= pendingBalance * (Number(hp.tax_percentage) || 0) / 100;

      let adjTotal = 0;
      for (const adj of adjustments) {
        if (adj.adjustment_type === 'credit') adjTotal += Number(adj.amount);
        else adjTotal -= Number(adj.amount);
      }
      pendingBalance += adjTotal;

      const paidAmount = paidRecs
        .filter((r: any) => r.status === 'paid')
        .reduce((sum: number, r: any) => sum + (Number(r.net_pay) || 0), 0);
      pendingBalance -= paidAmount;

      if (pendingBalance > 0) totalPendingValidation += pendingBalance;
    }
  }

  // Get last paid_at date
  let lastPayQuery = service
    .from('payroll_records')
    .select('paid_at')
    .eq('company_id', auth.companyId)
    .eq('status', 'paid')
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(1);
  if (branchId) lastPayQuery = lastPayQuery.eq('branch_id', branchId);
  const { data: lastPayData } = await lastPayQuery;
  const lastPayDate = lastPayData?.[0]?.paid_at ?? null;

  return jsonResponse({
    total_staff: totalStaff,
    total_paid: Math.round(totalPaid * 100) / 100,
    total_pending_validation: Math.round(totalPendingValidation * 100) / 100,
    total_validated: Math.round(totalValidated * 100) / 100,
    total_tax_deductions: Math.round(totalTaxDeductions * 100) / 100,
    last_pay_date: lastPayDate,
    period_start: pStart,
    period_end: pEnd,
  });
}

async function listPayroll(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'period_start', 'net_pay', 'status', 'gross_pay'],
  );
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('payroll_records')
    .select('*, staff:profiles!staff_id(id, name, email, avatar_url)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  if (branchId) query = query.eq('branch_id', branchId);

  const staffId = url.searchParams.get('staff_id');
  if (staffId) query = query.eq('staff_id', staffId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');
  if (periodStart) query = query.gte('period_start', periodStart);
  if (periodEnd) query = query.lte('period_end', periodEnd);

  const search = url.searchParams.get('search');
  if (search) query = query.ilike('staff.name', `%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  const staffIds = [...new Set((data ?? []).map((r: any) => r.staff_id))];
  let hrMap: Record<string, any> = {};
  let stationMap: Record<string, string> = {};

  if (staffIds.length > 0) {
    const { data: hrProfiles } = await service
      .from('staff_hr_profiles')
      .select('profile_id, staff_code, salary_type, base_pay, hourly_rate, payroll_suspended')
      .eq('company_id', auth.companyId)
      .in('profile_id', staffIds);
    for (const hr of hrProfiles ?? []) hrMap[hr.profile_id] = hr;

    const { data: stationStaff } = await service
      .from('hr_station_staff')
      .select('staff_id, station:hr_stations!inner(station_name)')
      .in('staff_id', staffIds);
    for (const ss of stationStaff ?? []) stationMap[ss.staff_id] = (ss as any).station?.station_name ?? '';
  }

  const enriched = (data ?? []).map((r: any) => ({
    ...r,
    staff_code: hrMap[r.staff_id]?.staff_code ?? null,
    salary_type: hrMap[r.staff_id]?.salary_type ?? null,
    hourly_rate: hrMap[r.staff_id]?.hourly_rate ?? null,
    base_rate: hrMap[r.staff_id]?.base_pay ?? null,
    payroll_suspended: hrMap[r.staff_id]?.payroll_suspended ?? false,
    station_name: stationMap[r.staff_id] ?? null,
  }));

  return jsonResponse({ items: enriched, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function getPayrollDetail(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const staffId = url.searchParams.get('staff_id');
  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');
  if (!staffId) return errorResponse('Missing staff_id');

  const service = createServiceClient();

  const { data: hrProfile } = await service
    .from('staff_hr_profiles')
    .select('*, profile:profiles!inner(id, name, email, avatar_url, branch_ids)')
    .eq('profile_id', staffId)
    .eq('company_id', auth.companyId)
    .single();
  if (!hrProfile) return errorResponse('Staff HR profile not found');

  const { data: stationStaff } = await service
    .from('hr_station_staff')
    .select('station:hr_stations!inner(id, station_name)')
    .eq('staff_id', staffId)
    .limit(1);
  const stationName = (stationStaff?.[0] as any)?.station?.station_name ?? null;

  let prQuery = service
    .from('payroll_records')
    .select('*')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .order('period_start', { ascending: false });
  if (periodStart) prQuery = prQuery.gte('period_start', periodStart);
  if (periodEnd) prQuery = prQuery.lte('period_end', periodEnd);
  const { data: payrollRecords } = await prQuery;

  let attQuery = service
    .from('attendance_records')
    .select('*')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .order('date', { ascending: true });
  if (periodStart) attQuery = attQuery.gte('date', periodStart);
  if (periodEnd) attQuery = attQuery.lte('date', periodEnd);
  const { data: attendance } = await attQuery;

  let saQuery = service
    .from('shift_assignments')
    .select('*, shift:hr_shifts!inner(shift_name, start_time, end_time, break_duration)')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .order('assignment_date', { ascending: true });
  if (periodStart) saQuery = saQuery.gte('assignment_date', periodStart);
  if (periodEnd) saQuery = saQuery.lte('assignment_date', periodEnd);
  const { data: assignments } = await saQuery;

  let lvQuery = service
    .from('leave_requests')
    .select('*, leave_type:leave_types!leave_type_id(id, name, is_paid)')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .eq('status', 'approved');
  if (periodStart) lvQuery = lvQuery.gte('start_date', periodStart);
  if (periodEnd) lvQuery = lvQuery.lte('end_date', periodEnd);
  const { data: leaves } = await lvQuery;

  // Get adjustments
  let adjQuery = service
    .from('payroll_adjustments')
    .select('*')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });
  const { data: adjustments } = await adjQuery;

  const { data: pendingData } = await service
    .from('payroll_records')
    .select('net_pay')
    .eq('staff_id', staffId)
    .eq('company_id', auth.companyId)
    .in('status', ['validated', 'pending_payout']);
  const pendingAmount = (pendingData ?? []).reduce((s: number, r: any) => s + (Number(r.net_pay) || 0), 0);

  // Build daily breakdown from attendance for payslip
  const dailyBreakdown = (attendance ?? []).map((a: any) => {
    const hrs = Number(a.total_hours) || 0;
    const otHrs = Number(a.overtime_hours) || 0;
    const rate = Number(hrProfile.hourly_rate) || Number(hrProfile.base_pay) || 0;
    const otRate = Number(hrProfile.overtime_rate) || 0;
    const dailyPay = hrProfile.salary_type === 'hourly' ? hrs * rate
      : hrProfile.salary_type === 'daily' ? rate
      : 0;
    const otPay = otHrs * otRate;
    const taxPct = Number(hrProfile.tax_percentage) || 0;
    const tax = (dailyPay + otPay) * taxPct / 100;
    return {
      date: a.date,
      clock_in: a.clock_in,
      clock_out: a.clock_out,
      hours: hrs,
      overtime_hours: otHrs,
      status: a.status,
      daily_pay: Math.round(dailyPay * 100) / 100,
      overtime_pay: Math.round(otPay * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      net: Math.round((dailyPay + otPay - tax) * 100) / 100,
    };
  });

  return jsonResponse({
    profile: { ...hrProfile, station_name: stationName },
    payroll_records: payrollRecords ?? [],
    attendance: attendance ?? [],
    assignments: assignments ?? [],
    leaves: leaves ?? [],
    adjustments: adjustments ?? [],
    daily_breakdown: dailyBreakdown,
    pending_amount: pendingAmount,
  });
}

async function generatePayroll(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.period_start || !body.period_end) return errorResponse('Missing period_start or period_end');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const { data: hrStaff, error: hrError } = await service
    .from('staff_hr_profiles')
    .select('*, profile:profiles!inner(id, name, email, branch_ids)')
    .eq('company_id', auth.companyId)
    .eq('payroll_suspended', false);
  if (hrError) return errorResponse(hrError.message);

  const staffList = branchId
    ? (hrStaff ?? []).filter((s: any) => s.profile?.branch_ids?.includes(branchId))
    : (hrStaff ?? []);

  if (staffList.length === 0) return errorResponse('No active staff HR profiles found');

  const pStart = body.period_start;
  const pEnd = body.period_end;
  const startD = new Date(pStart);
  const endD = new Date(pEnd);
  const totalCalendarDays = Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1;

  const records = [];
  for (const staff of staffList) {
    const sid = staff.profile_id;

    const { data: assignments } = await service
      .from('shift_assignments')
      .select('assignment_date, shift:hr_shifts!inner(start_time, end_time, break_duration)')
      .eq('staff_id', sid)
      .eq('company_id', auth.companyId)
      .gte('assignment_date', pStart)
      .lte('assignment_date', pEnd);

    const { data: attendanceData } = await service
      .from('attendance_records')
      .select('date, total_hours, overtime_hours, status, break_minutes')
      .eq('staff_id', sid)
      .eq('company_id', auth.companyId)
      .gte('date', pStart)
      .lte('date', pEnd);

    const { data: leaveData } = await service
      .from('leave_requests')
      .select('start_date, end_date, leave_type:leave_types!leave_type_id(is_paid)')
      .eq('staff_id', sid)
      .eq('company_id', auth.companyId)
      .eq('status', 'approved')
      .or(`start_date.lte.${pEnd},end_date.gte.${pStart}`);

    const scheduledDates = new Set<string>();
    let totalScheduledHours = 0;
    let totalBreakHours = 0;
    for (const a of assignments ?? []) {
      scheduledDates.add(a.assignment_date);
      const shift = (a as any).shift;
      if (shift) {
        const [sh, sm] = shift.start_time.split(':').map(Number);
        const [eh, em] = shift.end_time.split(':').map(Number);
        let durMin = (eh * 60 + em) - (sh * 60 + sm);
        if (durMin <= 0) durMin += 24 * 60;
        totalScheduledHours += durMin / 60;
        totalBreakHours += (shift.break_duration ?? 0) / 60;
      }
    }

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    const leaveDates = new Set<string>();
    for (const lv of leaveData ?? []) {
      const ls = new Date(Math.max(new Date(lv.start_date).getTime(), startD.getTime()));
      const le = new Date(Math.min(new Date(lv.end_date).getTime(), endD.getTime()));
      const isPaid = (lv as any).leave_type?.is_paid !== false;
      for (let dd = new Date(ls); dd <= le; dd.setDate(dd.getDate() + 1)) {
        const ds = dd.toISOString().slice(0, 10);
        if (!leaveDates.has(ds)) {
          leaveDates.add(ds);
          if (isPaid) paidLeaveDays++; else unpaidLeaveDays++;
        }
      }
    }

    const attMap = new Map<string, any>();
    for (const a of attendanceData ?? []) attMap.set(a.date, a);

    let actualWorkedHours = 0;
    let overtimeHours = 0;
    let daysWorked = 0;

    for (const dateStr of scheduledDates) {
      if (leaveDates.has(dateStr)) continue;
      const att = attMap.get(dateStr);
      if (att && att.status !== 'absent') {
        actualWorkedHours += Number(att.total_hours) || 0;
        overtimeHours += Number(att.overtime_hours) || 0;
        daysWorked++;
      } else if (!att) {
        const assignment = (assignments ?? []).find((a: any) => a.assignment_date === dateStr);
        if (assignment) {
          const shift = (assignment as any).shift;
          if (shift) {
            const [sh, sm] = shift.start_time.split(':').map(Number);
            const [eh, em] = shift.end_time.split(':').map(Number);
            let durMin = (eh * 60 + em) - (sh * 60 + sm);
            if (durMin <= 0) durMin += 24 * 60;
            actualWorkedHours += durMin / 60;
            daysWorked++;
          }
        }
      }
    }

    const daysOff = totalCalendarDays - daysWorked - paidLeaveDays - unpaidLeaveDays;

    const baseRate = Number(staff.base_pay) || 0;
    const hourlyRate = Number(staff.hourly_rate) || 0;
    const overtimeRate = Number(staff.overtime_rate) || 0;
    const allowanceAmt = Number(staff.allowances) || 0;
    const taxPct = Number(staff.tax_percentage) || 0;

    let basePay: number;
    if (staff.salary_type === 'hourly') {
      basePay = actualWorkedHours * (hourlyRate || baseRate);
    } else if (staff.salary_type === 'daily') {
      basePay = daysWorked * (hourlyRate || baseRate);
    } else {
      const workableDays = totalCalendarDays - daysOff;
      basePay = workableDays > 0 ? baseRate * ((daysWorked + paidLeaveDays) / workableDays) : baseRate;
    }

    let leavePay = 0;
    if (staff.salary_type === 'hourly' && paidLeaveDays > 0) {
      const avgDailyHrs = scheduledDates.size > 0 ? totalScheduledHours / scheduledDates.size : 8;
      leavePay = paidLeaveDays * avgDailyHrs * (hourlyRate || baseRate);
    } else if (staff.salary_type === 'daily' && paidLeaveDays > 0) {
      leavePay = paidLeaveDays * (hourlyRate || baseRate);
    }
    basePay += leavePay;

    // Get adjustments for this staff
    const { data: adjData } = await service
      .from('payroll_adjustments')
      .select('adjustment_type, amount')
      .eq('staff_id', sid)
      .eq('company_id', auth.companyId);
    let adjTotal = 0;
    for (const adj of adjData ?? []) {
      if (adj.adjustment_type === 'credit') adjTotal += Number(adj.amount);
      else adjTotal -= Number(adj.amount);
    }

    const overtimePay = overtimeHours * overtimeRate;
    const grossPay = basePay + overtimePay + allowanceAmt + adjTotal;
    const tax = grossPay * taxPct / 100;
    const netPay = grossPay - tax;

    records.push({
      company_id: auth.companyId,
      branch_id: branchId,
      staff_id: sid,
      period_start: pStart,
      period_end: pEnd,
      base_pay: Math.round(basePay * 100) / 100,
      overtime_pay: Math.round(overtimePay * 100) / 100,
      allowances: allowanceAmt,
      deductions: 0,
      adjustments_total: Math.round(adjTotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      gross_pay: Math.round(grossPay * 100) / 100,
      net_pay: Math.round(netPay * 100) / 100,
      total_worked_hours: Math.round(actualWorkedHours * 100) / 100,
      total_leave_hours: Math.round(paidLeaveDays * 8 * 100) / 100,
      total_break_hours: Math.round(totalBreakHours * 100) / 100,
      days_worked: daysWorked,
      days_off: daysOff,
      days_leave: paidLeaveDays,
      status: 'draft',
    });
  }

  const { data, error } = await service
    .from('payroll_records')
    .insert(records)
    .select('*, staff:profiles!staff_id(id, name, email, avatar_url)');

  if (error) return errorResponse(error.message);
  return jsonResponse({ records: data, count: data?.length ?? 0 });
}

async function validatePayroll(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const service = createServiceClient();
  const branchId = resolveBranchId(auth, req);

  // If staff_id is provided without a record, auto-create a payroll record from attendance
  if (body.staff_id && !body.ids) {
    const periodStart = body.period_start;
    const periodEnd = body.period_end;
    if (!periodStart || !periodEnd) return errorResponse('Missing period_start or period_end');

    // Get the HR profile
    const { data: hrProfile, error: hrErr } = await service
      .from('staff_hr_profiles')
      .select('*, profile:profiles!inner(branch_ids)')
      .eq('profile_id', body.staff_id)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (hrErr || !hrProfile) return errorResponse(hrErr?.message ?? 'HR profile not found');

    // Get attendance for the period
    const { data: att } = await service
      .from('attendance_records')
      .select('total_hours, overtime_hours, status')
      .eq('company_id', auth.companyId)
      .eq('staff_id', body.staff_id)
      .gte('date', periodStart)
      .lte('date', periodEnd);
    const attData = att ?? [];

    const workedHours = attData.reduce((sum: number, a: any) => sum + (Number(a.total_hours) || 0), 0);
    const overtimeHours = attData.reduce((sum: number, a: any) => sum + (Number(a.overtime_hours) || 0), 0);
    const daysWorked = attData.filter((a: any) => a.status === 'present').length;
    const hourlyRate = Number(hrProfile.hourly_rate) || 0;
    const baseRate = Number(hrProfile.base_pay) || 0;

    let basePay = 0;
    if (hrProfile.salary_type === 'hourly') basePay = workedHours * (hourlyRate || baseRate);
    else if (hrProfile.salary_type === 'daily') basePay = daysWorked * (hourlyRate || baseRate);
    else basePay = baseRate;

    const overtimePay = overtimeHours * (Number(hrProfile.overtime_rate) || 0);
    const allowances = Number(hrProfile.allowances) || 0;
    const grossPay = basePay + overtimePay + allowances;
    const tax = grossPay * (Number(hrProfile.tax_percentage) || 0) / 100;

    // Apply adjustments
    const { data: adjData } = await service
      .from('payroll_adjustments')
      .select('adjustment_type, amount')
      .eq('company_id', auth.companyId)
      .eq('staff_id', body.staff_id);
    let adjTotal = 0;
    for (const adj of adjData ?? []) {
      if (adj.adjustment_type === 'credit') adjTotal += Number(adj.amount);
      else adjTotal -= Number(adj.amount);
    }

    const netPay = Math.max(grossPay - tax + adjTotal, 0);
    const staffBranch = (hrProfile as any).profile?.branch_ids?.[0] ?? branchId;

    const { data: record, error: insertErr } = await service
      .from('payroll_records')
      .insert({
        company_id: auth.companyId,
        branch_id: staffBranch ?? null,
        staff_id: body.staff_id,
        period_start: periodStart,
        period_end: periodEnd,
        base_pay: Math.round(basePay * 100) / 100,
        overtime_pay: Math.round(overtimePay * 100) / 100,
        allowances: Math.round(allowances * 100) / 100,
        deductions: Math.round(Math.abs(adjTotal < 0 ? adjTotal : 0) * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        gross_pay: Math.round(grossPay * 100) / 100,
        net_pay: Math.round(netPay * 100) / 100,
        status: 'validated',
        validated_by: auth.userId,
        validated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) return errorResponse(insertErr.message);
    return jsonResponse({ records: [record], count: 1 });
  }

  // Original flow: validate existing draft records by IDs
  if (!body.ids || !Array.isArray(body.ids)) return errorResponse('Missing ids array');
  const { data, error } = await service
    .from('payroll_records')
    .update({ status: 'validated', validated_by: auth.userId, validated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', body.ids)
    .eq('company_id', auth.companyId)
    .eq('status', 'draft')
    .select();

  if (error) return errorResponse(error.message);
  return jsonResponse({ records: data, count: data?.length ?? 0 });
}

async function issuePayment(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.ids || !Array.isArray(body.ids)) return errorResponse('Missing ids array');

  const service = createServiceClient();
  const { data, error } = await service
    .from('payroll_records')
    .update({ status: 'paid', paid_at: new Date().toISOString(), approved_by: auth.userId, updated_at: new Date().toISOString() })
    .in('id', body.ids)
    .eq('company_id', auth.companyId)
    .eq('status', 'validated')
    .select();

  if (error) return errorResponse(error.message);
  return jsonResponse({ records: data, count: data?.length ?? 0 });
}

async function payAllValidated(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('payroll_records')
    .update({ status: 'paid', paid_at: new Date().toISOString(), approved_by: auth.userId, updated_at: new Date().toISOString() })
    .eq('company_id', auth.companyId)
    .eq('status', 'validated');
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.select();

  if (error) return errorResponse(error.message);
  return jsonResponse({ records: data, count: data?.length ?? 0 });
}

async function adjustPay(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id || !body.adjustment_type || body.amount === undefined)
    return errorResponse('Missing staff_id, adjustment_type, or amount');
  if (!['credit', 'debit'].includes(body.adjustment_type))
    return errorResponse('adjustment_type must be credit or debit');

  const service = createServiceClient();
  const { data, error } = await service
    .from('payroll_adjustments')
    .insert({
      company_id: auth.companyId,
      staff_id: body.staff_id,
      payroll_id: body.payroll_id || null,
      adjustment_type: body.adjustment_type,
      amount: Number(body.amount),
      reason: body.reason || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ adjustment: data });
}

async function removeFromPayroll(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id) return errorResponse('Missing staff_id');

  const service = createServiceClient();
  // Set payroll_suspended=true and mark as removed
  const { data, error } = await service
    .from('staff_hr_profiles')
    .update({ payroll_suspended: true, updated_at: new Date().toISOString() })
    .eq('profile_id', body.staff_id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ profile: data });
}

async function suspendPayroll(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id) return errorResponse('Missing staff_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('staff_hr_profiles')
    .update({ payroll_suspended: true, updated_at: new Date().toISOString() })
    .eq('profile_id', body.staff_id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ profile: data });
}

async function unsuspendPayroll(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id) return errorResponse('Missing staff_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('staff_hr_profiles')
    .update({ payroll_suspended: false, updated_at: new Date().toISOString() })
    .eq('profile_id', body.staff_id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ profile: data });
}

async function getPayrollSettings(req: Request, auth: AuthContext) {
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('payroll_settings')
    .select('*')
    .eq('company_id', auth.companyId);
  if (branchId) query = query.eq('branch_id', branchId);
  else query = query.is('branch_id', null);
  const { data } = await query.single();

  return jsonResponse({ settings: data ?? { pay_day: 25, auto_pay: false } });
}

async function savePayrollSettings(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const payDay = Math.min(Math.max(Number(body.pay_day) || 25, 1), 28);
  const autoPay = !!body.auto_pay;

  const { data, error } = await service
    .from('payroll_settings')
    .upsert({
      company_id: auth.companyId,
      branch_id: branchId || null,
      pay_day: payDay,
      auto_pay: autoPay,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,branch_id' })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ settings: data });
}




// Leave Types
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listLeaveTypes(req: Request, auth: AuthContext) {
  const service = createServiceClient();
  const { data, error } = await service
    .from('leave_types')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('name');

  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data, total: data?.length ?? 0 });
}

async function upsertLeaveType(req: Request, auth: AuthContext) {
  if (req.method !== 'POST' && req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.name) return errorResponse('Missing name');

  const service = createServiceClient();
  const record: Record<string, unknown> = {
    company_id: auth.companyId,
    name: sanitizeString(body.name, 100),
  };
  if (body.id) record.id = body.id;
  if (body.max_days !== undefined) record.max_days = body.max_days;
  if (body.is_paid !== undefined) record.is_paid = body.is_paid;
  if (body.is_active !== undefined) record.is_active = body.is_active;

  const { data, error } = await service
    .from('leave_types')
    .upsert(record, { onConflict: body.id ? 'id' : 'company_id,name' })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ leave_type: data });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Leave Requests
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listLeaveRequests(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'start_date', 'status'],
  );
  const service = createServiceClient();

  let query = service
    .from('leave_requests')
    .select('*, staff:profiles!staff_id(id, name, email, avatar_url), leave_type:leave_types!leave_type_id(id, name, is_paid), reviewer:profiles!reviewed_by(id, name)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  const staffId = url.searchParams.get('staff_id');
  if (staffId) query = query.eq('staff_id', staffId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const search = url.searchParams.get('search');
  if (search) query = query.ilike('staff.name', `%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function createLeaveRequest(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id || !body.leave_type_id || !body.start_date || !body.end_date) {
    return errorResponse('Missing required fields');
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('leave_requests')
    .insert({
      company_id: auth.companyId,
      staff_id: body.staff_id,
      leave_type_id: body.leave_type_id,
      start_date: body.start_date,
      end_date: body.end_date,
      reason: body.reason ? sanitizeString(body.reason, 500) : null,
    })
    .select('*, staff:profiles!staff_id(id, name, email), leave_type:leave_types!leave_type_id(id, name)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ request: data });
}

async function reviewLeaveRequest(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id || !body.status) return errorResponse('Missing id or status');
  if (!['approved', 'rejected'].includes(body.status)) return errorResponse('Invalid status');

  const service = createServiceClient();
  const { data, error } = await service
    .from('leave_requests')
    .update({
      status: body.status,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: body.review_notes ? sanitizeString(body.review_notes, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ request: data });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Performance Records
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function listPerformance(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'record_date', 'record_type'],
  );
  const service = createServiceClient();

  let query = service
    .from('performance_records')
    .select('*, staff:profiles!staff_id(id, name, email, avatar_url), recorder:profiles!recorded_by(id, name)', { count: 'exact' })
    .eq('company_id', auth.companyId);

  const staffId = url.searchParams.get('staff_id');
  if (staffId) query = query.eq('staff_id', staffId);

  const recordType = url.searchParams.get('record_type');
  if (recordType) query = query.eq('record_type', recordType);

  const search = url.searchParams.get('search');
  if (search) query = query.ilike('staff.name', `%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data, total: count, page, page_size: pageSize, total_pages: Math.ceil((count ?? 0) / pageSize) });
}

async function createPerformance(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.staff_id || !body.record_type || !body.title) return errorResponse('Missing required fields');
  if (!['warning', 'complaint', 'commendation'].includes(body.record_type)) return errorResponse('Invalid record_type');

  const service = createServiceClient();
  const { data, error } = await service
    .from('performance_records')
    .insert({
      company_id: auth.companyId,
      staff_id: body.staff_id,
      record_type: body.record_type,
      title: sanitizeString(body.title, 200),
      description: body.description ? sanitizeString(body.description, 1000) : null,
      recorded_by: auth.userId,
      record_date: body.record_date ?? new Date().toISOString().slice(0, 10),
    })
    .select('*, staff:profiles!staff_id(id, name, email), recorder:profiles!recorded_by(id, name)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ record: data });
}

async function deletePerformance(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const { error } = await service
    .from('performance_records')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Stations
// ═══════════════════════════════════════════════════════════════════════════

async function listStations(req: Request, auth: AuthContext) {
  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  let query = service
    .from('hr_stations')
    .select('*, staff:hr_station_staff(id, staff_id, profile:profiles!inner(id, name, email, avatar_url))', { count: 'exact' })
    .eq('company_id', auth.companyId)
    .order('station_name', { ascending: true });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  // Compute monthly cost from HR profiles
  const staffIds = (data ?? []).flatMap((s: any) => (s.staff ?? []).map((ss: any) => ss.staff_id));
  let hrData: any[] = [];
  if (staffIds.length > 0) {
    const { data: hrRows } = await service
      .from('staff_hr_profiles')
      .select('profile_id, salary_type, base_pay, hourly_rate, allowances')
      .eq('company_id', auth.companyId)
      .in('profile_id', staffIds);
    hrData = hrRows ?? [];
  }
  const hrMap = new Map(hrData.map((h: any) => [h.profile_id, h]));

  const enriched = (data ?? []).map((station: any) => {
    const staffList = station.staff ?? [];
    let monthlyCost = 0;
    for (const ss of staffList) {
      const hr = hrMap.get(ss.staff_id);
      if (!hr) continue;
      if (hr.salary_type === 'monthly') monthlyCost += Number(hr.base_pay) + Number(hr.allowances);
      else if (hr.salary_type === 'hourly') monthlyCost += (Number(hr.hourly_rate) || Number(hr.base_pay)) * 160 + Number(hr.allowances);
      else if (hr.salary_type === 'daily') monthlyCost += Number(hr.base_pay) * 22 + Number(hr.allowances);
    }
    return { ...station, total_staff: staffList.length, monthly_cost: monthlyCost };
  });

  return jsonResponse({ items: enriched, total: count });
}

async function getStation(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const stationId = url.searchParams.get('station_id');
  if (!stationId) return errorResponse('Missing station_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('hr_stations')
    .select('*, staff:hr_station_staff(id, staff_id, profile:profiles!inner(id, name, email, avatar_url))')
    .eq('id', stationId)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (error) return errorResponse(error.message);
  return jsonResponse({ station: data });
}

async function createStation(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.station_name) return errorResponse('Missing station_name');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  const { data, error } = await service
    .from('hr_stations')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      station_name: sanitizeString(body.station_name, 100),
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  if (body.staff_ids && Array.isArray(body.staff_ids) && body.staff_ids.length > 0) {
    const rows = body.staff_ids.map((sid: string) => ({ station_id: data.id, staff_id: sid }));
    const { error: staffErr } = await service.from('hr_station_staff').insert(rows);
    if (staffErr) return errorResponse(staffErr.message);
  }

  const { data: full } = await service
    .from('hr_stations')
    .select('*, staff:hr_station_staff(id, staff_id, profile:profiles!inner(id, name, email, avatar_url))')
    .eq('id', data.id)
    .single();

  return jsonResponse({ station: full });
}

async function updateStation(req: Request, auth: AuthContext) {
  if (req.method !== 'POST' && req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.station_name) updates.station_name = sanitizeString(body.station_name, 100);

  const { error } = await service
    .from('hr_stations')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);

  if (body.staff_ids && Array.isArray(body.staff_ids)) {
    await service.from('hr_station_staff').delete().eq('station_id', body.id);
    if (body.staff_ids.length > 0) {
      const rows = body.staff_ids.map((sid: string) => ({ station_id: body.id, staff_id: sid }));
      const { error: staffErr } = await service.from('hr_station_staff').insert(rows);
      if (staffErr) return errorResponse(staffErr.message);
    }
  }

  const { data: full } = await service
    .from('hr_stations')
    .select('*, staff:hr_station_staff(id, staff_id, profile:profiles!inner(id, name, email, avatar_url))')
    .eq('id', body.id)
    .single();

  return jsonResponse({ station: full });
}

async function deleteStation(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const { error } = await service
    .from('hr_stations')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Schedules
// ═══════════════════════════════════════════════════════════════════════════

async function listSchedules(req: Request, auth: AuthContext) {
  const branchId = resolveBranchId(auth, req);
  const url = new URL(req.url);
  const stationId = url.searchParams.get('station_id');
  const service = createServiceClient();

  let query = service
    .from('hr_schedules')
    .select('*, station:hr_stations!inner(id, station_name), creator:profiles!created_by(id, name)', { count: 'exact' })
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  if (stationId) query = query.eq('station_id', stationId);

  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  // For each schedule, count assignments
  const scheduleIds = (data ?? []).map((s: any) => s.id);
  let assignCounts: Record<string, number> = {};
  if (scheduleIds.length > 0) {
    const { data: counts } = await service
      .from('shift_assignments')
      .select('schedule_id')
      .in('schedule_id', scheduleIds);
    for (const row of counts ?? []) {
      assignCounts[row.schedule_id] = (assignCounts[row.schedule_id] || 0) + 1;
    }
  }

  const enriched = (data ?? []).map((s: any) => ({
    ...s,
    assignment_count: assignCounts[s.id] || 0,
  }));

  return jsonResponse({ items: enriched, total: count });
}

async function getScheduleDetail(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const scheduleId = url.searchParams.get('schedule_id');
  if (!scheduleId) return errorResponse('Missing schedule_id');

  const service = createServiceClient();

  // Fetch the schedule entity
  const { data: schedule, error: schErr } = await service
    .from('hr_schedules')
    .select('*, station:hr_stations!inner(id, station_name)')
    .eq('id', scheduleId)
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (schErr) return errorResponse(schErr.message);
  if (!schedule) return errorResponse('Schedule not found', 404);

  // Fetch all assignments for this schedule
  const { data: assignments, error: assErr } = await service
    .from('shift_assignments')
    .select('*, staff:profiles!inner(id, name, email, avatar_url), shift:hr_shifts!inner(id, shift_name, start_time, end_time)')
    .eq('schedule_id', scheduleId)
    .order('assignment_date', { ascending: true });
  if (assErr) return errorResponse(assErr.message);

  // Fetch all available shifts for editing
  const { data: allShifts } = await service
    .from('hr_shifts')
    .select('id, shift_name, start_time, end_time')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .order('shift_name');

  return jsonResponse({ schedule, assignments: assignments ?? [], shifts: allShifts ?? [] });
}

async function generateSchedule(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const { station_id, shift_ids, staff_ids, date_from, date_to } = body;
  const maxHoursPerWeek: number = body.max_hours_per_week ?? 48;
  const offDaysAfterMax: number = body.off_days_after_max ?? 1;

  if (!station_id || !date_from || !date_to) return errorResponse('Missing station_id, date_from, or date_to');
  if (!shift_ids || !Array.isArray(shift_ids) || shift_ids.length === 0) return errorResponse('Select at least one shift');
  if (!staff_ids || !Array.isArray(staff_ids) || staff_ids.length === 0) return errorResponse('Select at least one staff member');

  const branchId = resolveBranchId(auth, req);
  const service = createServiceClient();

  // Create the schedule entity first
  const { data: schedule, error: schErr } = await service
    .from('hr_schedules')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      station_id,
      date_from,
      date_to,
      created_by: auth.userId,
    })
    .select()
    .single();
  if (schErr) return errorResponse(schErr.message);

  // Fetch shift details
  const { data: shifts, error: shiftErr } = await service
    .from('hr_shifts')
    .select('*')
    .in('id', shift_ids)
    .eq('company_id', auth.companyId);
  if (shiftErr) return errorResponse(shiftErr.message);
  if (!shifts || shifts.length === 0) return errorResponse('No valid shifts found');

  // Delete any existing assignments for these staff in this date range
  await service
    .from('shift_assignments')
    .delete()
    .eq('company_id', auth.companyId)
    .in('staff_id', staff_ids)
    .in('shift_id', shift_ids)
    .gte('assignment_date', date_from)
    .lte('assignment_date', date_to);

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return errorResponse('Invalid dates');

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // ──────────────────────────────────────────────────────────────────────
  // Classify shifts into Morning / Evening / Night by start_time
  // ──────────────────────────────────────────────────────────────────────
  type ShiftType = 'morning' | 'evening' | 'night';
  interface ShiftInfo {
    id: string; shift_name: string; start_time: string; end_time: string;
    max_staff: number; break_duration: number; duration_hours: number; type: ShiftType;
  }

  function classifyShift(s: any): ShiftInfo {
    const startH = parseInt(s.start_time.split(':')[0], 10);
    let type: ShiftType = 'morning';
    if (startH >= 14 && startH < 21) type = 'evening';
    else if (startH >= 21 || startH < 5) type = 'night';

    // Calculate shift duration in hours
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    let durMin = (eh * 60 + em) - (sh * 60 + sm);
    if (durMin <= 0) durMin += 24 * 60; // overnight shift
    const duration_hours = durMin / 60;

    return { id: s.id, shift_name: s.shift_name, start_time: s.start_time, end_time: s.end_time,
      max_staff: s.max_staff ?? 5, break_duration: s.break_duration ?? 0, duration_hours, type };
  }

  const shiftInfos = shifts.map(classifyShift);

  // Sort shifts: morning → evening → night for rotation order
  const typeOrder: Record<ShiftType, number> = { morning: 0, evening: 1, night: 2 };
  shiftInfos.sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.start_time.localeCompare(b.start_time));

  // ──────────────────────────────────────────────────────────────────────
  // Per-staff tracking state
  // ──────────────────────────────────────────────────────────────────────
  interface StaffState {
    id: string;
    dailyHours: Map<string, number>;  // dateStr → hours worked that day
    totalHours: number;
    totalShifts: number;
    shiftTypeCounts: Record<ShiftType, number>;
    lastShiftType: ShiftType | null;
    consecutiveWorkDays: number;
    offDays: Set<string>;             // pre-planned off days (dateStr)
    rotationIndex: number;
  }

  // Rolling 7-day window: sum hours from [dateStr-6 .. dateStr]
  function rollingWeekHours(state: StaffState, dateStr: string): number {
    const d = new Date(dateStr);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const check = new Date(d);
      check.setDate(d.getDate() - i);
      total += state.dailyHours.get(check.toISOString().slice(0, 10)) ?? 0;
    }
    return total;
  }

  // ── Pre-compute staggered off-day patterns ────────────────────────────
  // How many days per 7-day cycle can a staff member work?
  const avgShiftDuration = shiftInfos.reduce((s, sh) => s + sh.duration_hours, 0) / shiftInfos.length;
  const maxWorkDays = Math.min(6, Math.floor(maxHoursPerWeek / avgShiftDuration));
  const offDaysPerCycle = Math.max(offDaysAfterMax, 7 - maxWorkDays);

  // For each staff, compute which day-of-cycle indices are off (staggered)
  const numStaff = staff_ids.length;
  const staffCycleOffDays: Set<number>[] = [];
  for (let i = 0; i < numStaff; i++) {
    const offSet = new Set<number>();
    const offset = Math.floor(i * 7 / numStaff);
    for (let j = 0; j < offDaysPerCycle; j++) {
      offSet.add((offset + j) % 7);
    }
    staffCycleOffDays.push(offSet);
  }

  // Initialise staff states with pre-planned off days
  const staffStates = new Map<string, StaffState>();
  for (let i = 0; i < numStaff; i++) {
    const offDays = new Set<string>();
    for (let day = 0; day < totalDays; day++) {
      if (staffCycleOffDays[i].has(day % 7)) {
        const dd = new Date(startDate);
        dd.setDate(startDate.getDate() + day);
        offDays.add(dd.toISOString().slice(0, 10));
      }
    }
    staffStates.set(staff_ids[i], {
      id: staff_ids[i],
      dailyHours: new Map(),
      totalHours: 0, totalShifts: 0,
      shiftTypeCounts: { morning: 0, evening: 0, night: 0 },
      lastShiftType: null, consecutiveWorkDays: 0,
      offDays,
      rotationIndex: i % shiftInfos.length,
    });
  }

  const assignments: any[] = [];
  const warnings: { date: string; shift_name: string; needed: number; assigned: number }[] = [];

  // ──────────────────────────────────────────────────────────────────────
  // Main scheduling loop: day by day
  // ──────────────────────────────────────────────────────────────────────
  for (let d = 0; d < totalDays; d++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + d);
    const dateStr = currentDate.toISOString().slice(0, 10);
    const assignedToday = new Set<string>();

    for (const shift of shiftInfos) {
      // Split eligible staff into primary (working day) and secondary (off-day backup)
      const primary: StaffState[] = [];
      const secondary: StaffState[] = [];

      for (const st of staffStates.values()) {
        if (assignedToday.has(st.id)) continue;
        // Hard: rolling 7-day hours limit
        if (rollingWeekHours(st, dateStr) + shift.duration_hours > maxHoursPerWeek) continue;
        // Hard: night-shift recovery
        if (shift.type === 'morning' && st.lastShiftType === 'night') continue;

        if (st.offDays.has(dateStr)) {
          secondary.push(st); // on their off day – available as backup only
        } else {
          primary.push(st);
        }
      }

      // Sort by fairness: fewest total hours → fewest of this shift type → rotation match
      const sortFn = (a: StaffState, b: StaffState) => {
        const hd = a.totalHours - b.totalHours;
        if (Math.abs(hd) > 0.5) return hd;
        const td = a.shiftTypeCounts[shift.type] - b.shiftTypeCounts[shift.type];
        if (td !== 0) return td;
        const aR = shiftInfos[a.rotationIndex % shiftInfos.length]?.type === shift.type ? 0 : 1;
        const bR = shiftInfos[b.rotationIndex % shiftInfos.length]?.type === shift.type ? 0 : 1;
        return aR - bR;
      };
      primary.sort(sortFn);
      secondary.sort(sortFn);

      // Use primary first; pull from secondary only for minimum coverage
      const pool = [...primary];
      if (pool.length < shift.max_staff) {
        pool.push(...secondary.slice(0, shift.max_staff - pool.length));
      }

      const toAssign = Math.min(shift.max_staff, pool.length);

      if (pool.length < shift.max_staff) {
        warnings.push({ date: dateStr, shift_name: shift.shift_name, needed: shift.max_staff, assigned: toAssign });
      }

      for (let i = 0; i < toAssign; i++) {
        const st = pool[i];

        assignments.push({
          company_id: auth.companyId,
          branch_id: branchId,
          staff_id: st.id,
          shift_id: shift.id,
          assignment_date: dateStr,
          station_id,
          schedule_id: schedule.id,
        });

        // Update tracking
        assignedToday.add(st.id);
        const prev = st.dailyHours.get(dateStr) ?? 0;
        st.dailyHours.set(dateStr, prev + shift.duration_hours);
        st.totalHours += shift.duration_hours;
        st.totalShifts += 1;
        st.shiftTypeCounts[shift.type] += 1;
        st.lastShiftType = shift.type;
        st.consecutiveWorkDays += 1;
        st.rotationIndex = (st.rotationIndex + 1) % shiftInfos.length;
      }
    }

    // End-of-day: reset consecutive tracking for unassigned staff
    for (const st of staffStates.values()) {
      if (!assignedToday.has(st.id)) {
        st.consecutiveWorkDays = 0;
        st.lastShiftType = null;
      }
    }
  }

  if (assignments.length === 0) return jsonResponse({ schedule, assignments: [], count: 0, warnings });

  const { data, error } = await service.from('shift_assignments').insert(assignments).select();
  if (error) return errorResponse(error.message);
  return jsonResponse({ schedule, assignments: data, count: data?.length ?? 0, warnings });
}

async function updateAssignment(req: Request, auth: AuthContext) {
  if (req.method !== 'POST' && req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  const updates: Record<string, unknown> = {};
  if (body.shift_id !== undefined) updates.shift_id = body.shift_id;
  if (body.notes !== undefined) updates.notes = body.notes ? sanitizeString(body.notes, 500) : null;

  if (Object.keys(updates).length === 0) return errorResponse('No fields to update');

  const { data, error } = await service
    .from('shift_assignments')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select('*, staff:profiles!inner(id, name, email, avatar_url), shift:hr_shifts!inner(id, shift_name, start_time, end_time)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ assignment: data });
}

async function deleteSchedule(req: Request, auth: AuthContext) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing id');

  const service = createServiceClient();
  // Cascade will delete linked shift_assignments
  const { error } = await service
    .from('hr_schedules')
    .delete()
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// ===========================================================================
// Self-Service (Restricted User) Endpoints
// ===========================================================================

async function myClockStatus(_req: Request, auth: AuthContext) {
  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Check today's attendance record
  const { data: att } = await service
    .from('attendance_records')
    .select('*')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .eq('date', today)
    .maybeSingle();

  // Auto clock-out: if clocked in but shift has ended
  if (att && att.clock_in && !att.clock_out && att.shift_id) {
    const { data: shift } = await service
      .from('hr_shifts')
      .select('end_time, start_time')
      .eq('id', att.shift_id)
      .maybeSingle();
    if (shift) {
      const [sh, sm] = shift.start_time.split(':').map(Number);
      const [eh, em] = shift.end_time.split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin += 24 * 60;
      const adjustedCurrent = currentMinutes < startMin ? currentMinutes + 24 * 60 : currentMinutes;
      if (adjustedCurrent > endMin) {
        const [ciH, ciM] = att.clock_in.split(':').map(Number);
        const ciMin = ciH * 60 + ciM;
        let totalMin = endMin - (ciMin < startMin ? ciMin + 24 * 60 : ciMin);
        if (totalMin < 0) totalMin += 24 * 60;
        const totalHours = Math.round((totalMin / 60) * 100) / 100;
        await service
          .from('attendance_records')
          .update({ clock_out: shift.end_time, total_hours: totalHours, status: 'present', updated_at: new Date().toISOString() })
          .eq('id', att.id);
        return jsonResponse({
          clocked_in: false,
          auto_clocked_out: true,
          attendance: { ...att, clock_out: shift.end_time, total_hours: totalHours, status: 'present' },
          active_shift: null,
        });
      }
    }
  }

  // Find active shift for today (started or starting within 10 minutes)
  const { data: assignments } = await service
    .from('shift_assignments')
    .select('*, shift:hr_shifts!inner(id, shift_name, start_time, end_time, break_duration)')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .eq('assignment_date', today);

  let activeShift: any = null;
  for (const a of assignments ?? []) {
    const shift = (a as any).shift;
    if (!shift) continue;
    const [sh2, sm2] = shift.start_time.split(':').map(Number);
    const [eh2, em2] = shift.end_time.split(':').map(Number);
    const sMin = sh2 * 60 + sm2;
    let eMin = eh2 * 60 + em2;
    if (eMin <= sMin) eMin += 24 * 60;
    const canClockIn = currentMinutes >= sMin - 10 && currentMinutes <= eMin;
    if (canClockIn) {
      activeShift = { ...shift, station: a.station, assignment_date: a.assignment_date };
      break;
    }
  }

  return jsonResponse({
    clocked_in: !!(att?.clock_in && !att?.clock_out),
    attendance: att,
    active_shift: activeShift,
  });
}

async function clockIn(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const clockTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

  // Check not already clocked in
  const { data: existing } = await service
    .from('attendance_records')
    .select('id, clock_in, clock_out')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .eq('date', today)
    .maybeSingle();

  if (existing?.clock_in && !existing?.clock_out) {
    return errorResponse('Already clocked in');
  }

  // Validate active shift
  const { data: assignments } = await service
    .from('shift_assignments')
    .select('*, shift:hr_shifts!inner(id, shift_name, start_time, end_time, break_duration)')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .eq('assignment_date', today);

  let activeShift: any = null;
  for (const a of assignments ?? []) {
    const shift = (a as any).shift;
    if (!shift) continue;
    const [sh3, sm3] = shift.start_time.split(':').map(Number);
    const [eh3, em3] = shift.end_time.split(':').map(Number);
    const sMin3 = sh3 * 60 + sm3;
    let eMin3 = eh3 * 60 + em3;
    if (eMin3 <= sMin3) eMin3 += 24 * 60;
    if (currentMinutes >= sMin3 - 10 && currentMinutes <= eMin3) {
      activeShift = shift;
      break;
    }
  }

  if (!activeShift) {
    return errorResponse('No active shift found. You can only clock in if your shift has started or starts within 10 minutes.');
  }

  const branchId = auth.branchIds?.[0] ?? auth.activeBranchId;

  const record: Record<string, unknown> = {
    company_id: auth.companyId,
    branch_id: branchId,
    staff_id: auth.userId,
    date: today,
    shift_id: activeShift.id,
    clock_in: clockTime,
    status: 'present',
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    record.id = existing.id;
  }

  const { data, error } = await service
    .from('attendance_records')
    .upsert(record, { onConflict: 'staff_id,date' })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ record: data, shift: activeShift });
}

async function clockOut(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const clockTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

  const { data: att } = await service
    .from('attendance_records')
    .select('*')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .eq('date', today)
    .maybeSingle();

  if (!att || !att.clock_in || att.clock_out) {
    return errorResponse('Not clocked in');
  }

  // Calculate total hours
  const [ciH, ciM] = att.clock_in.split(':').map(Number);
  const ciMin = ciH * 60 + ciM;
  const coMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  let totalMin = coMin - ciMin;
  if (totalMin < 0) totalMin += 24 * 60;
  const breakMin = att.break_minutes ?? 0;
  const totalHours = Math.round(((totalMin - breakMin) / 60) * 100) / 100;

  // Check for overtime (if shift exists)
  let overtimeHours = 0;
  if (att.shift_id) {
    const { data: shift } = await service
      .from('hr_shifts')
      .select('start_time, end_time')
      .eq('id', att.shift_id)
      .maybeSingle();
    if (shift) {
      const [shO, smO] = shift.start_time.split(':').map(Number);
      const [ehO, emO] = shift.end_time.split(':').map(Number);
      let shiftMin = (ehO * 60 + emO) - (shO * 60 + smO);
      if (shiftMin <= 0) shiftMin += 24 * 60;
      const scheduledHours = (shiftMin - breakMin) / 60;
      if (totalHours > scheduledHours) {
        overtimeHours = Math.round((totalHours - scheduledHours) * 100) / 100;
      }
    }
  }

  const { data, error } = await service
    .from('attendance_records')
    .update({
      clock_out: clockTime,
      total_hours: Math.max(totalHours, 0),
      overtime_hours: overtimeHours,
      status: 'present',
      updated_at: new Date().toISOString(),
    })
    .eq('id', att.id)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ record: data });
}

async function myAttendance(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const service = createServiceClient();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);

  const { data, error } = await service
    .from('attendance_records')
    .select('*, shift:hr_shifts(shift_name)')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data });
}

async function mySchedule(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = url.searchParams.get('date_from') ?? today;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dateTo = url.searchParams.get('date_to') ?? futureDate.toISOString().slice(0, 10);

  const { data, error } = await service
    .from('shift_assignments')
    .select('*, shift:hr_shifts!inner(id, shift_name, start_time, end_time)')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .gte('assignment_date', dateFrom)
    .lte('assignment_date', dateTo)
    .order('assignment_date', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data });
}

async function myPayroll(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const service = createServiceClient();
  const now = new Date();
  const periodStart = url.searchParams.get('period_start') ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = url.searchParams.get('period_end') ?? now.toISOString().slice(0, 10);

  // Get HR profile
  const { data: hrProfile } = await service
    .from('staff_hr_profiles')
    .select('*')
    .eq('profile_id', auth.userId)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  // Get attendance for period
  const { data: attData } = await service
    .from('attendance_records')
    .select('total_hours, overtime_hours, status, date')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .gte('date', periodStart)
    .lte('date', periodEnd);

  const workedHours = (attData ?? []).reduce((s: number, a: any) => s + (Number(a.total_hours) || 0), 0);
  const overtimeHours = (attData ?? []).reduce((s: number, a: any) => s + (Number(a.overtime_hours) || 0), 0);
  const daysWorked = (attData ?? []).filter((a: any) => a.status === 'present').length;

  // Get payroll records
  const { data: prData } = await service
    .from('payroll_records')
    .select('*')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .gte('period_start', periodStart)
    .lte('period_end', periodEnd)
    .order('created_at', { ascending: false });

  const totalPaid = (prData ?? [])
    .filter((r: any) => r.status === 'paid')
    .reduce((s: number, r: any) => s + (Number(r.net_pay) || 0), 0);

  // Calculate pending balance
  let pendingBalance = 0;
  if (hrProfile) {
    const hourlyRate = Number(hrProfile.hourly_rate) || 0;
    const baseRate = Number(hrProfile.base_pay) || 0;
    if (hrProfile.salary_type === 'hourly') pendingBalance = workedHours * (hourlyRate || baseRate);
    else if (hrProfile.salary_type === 'daily') pendingBalance = daysWorked * (hourlyRate || baseRate);
    else pendingBalance = baseRate;
    pendingBalance += overtimeHours * (Number(hrProfile.overtime_rate) || 0);
    pendingBalance += Number(hrProfile.allowances) || 0;
    pendingBalance -= pendingBalance * (Number(hrProfile.tax_percentage) || 0) / 100;
    pendingBalance -= totalPaid;
    pendingBalance = Math.max(pendingBalance, 0);
  }

  const latestRecord = (prData ?? [])[0];

  return jsonResponse({
    worked_hours: Math.round(workedHours * 100) / 100,
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    days_worked: daysWorked,
    pending_balance: Math.round(pendingBalance * 100) / 100,
    total_paid: Math.round(totalPaid * 100) / 100,
    latest_status: latestRecord?.status ?? null,
    payroll_records: prData ?? [],
    period_start: periodStart,
    period_end: periodEnd,
  });
}

async function myLeaveRequests(_req: Request, auth: AuthContext) {
  const service = createServiceClient();

  const { data, error } = await service
    .from('leave_requests')
    .select('*, leave_type:leave_types!leave_type_id(id, name, is_paid)')
    .eq('staff_id', auth.userId)
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data });
}

async function myRequestLeave(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.leave_type_id || !body.start_date || !body.end_date) {
    return errorResponse('Missing leave_type_id, start_date or end_date');
  }

  const service = createServiceClient();
  const branchId = auth.branchIds?.[0] ?? auth.activeBranchId;

  const { data, error } = await service
    .from('leave_requests')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      staff_id: auth.userId,
      leave_type_id: body.leave_type_id,
      start_date: body.start_date,
      end_date: body.end_date,
      reason: body.reason ? sanitizeString(body.reason, 500) : null,
      status: 'pending',
    })
    .select('*, leave_type:leave_types!leave_type_id(id, name)')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ request: data });
}
