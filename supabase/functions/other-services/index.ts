import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId,
  validatePagination, applyPagination, sanitizeString,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const action = segments.pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;
    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    switch (action) {
      case 'list':
        return await listServices(req, supabase, auth, branchId);
      case 'create':
        return await createService(req, supabase, auth, branchId);
      case 'update':
        return await updateService(req, supabase, auth, branchId);
      case 'delete':
        return await deleteService(req, supabase, auth, branchId);
      case 'toggle-availability':
        return await toggleAvailability(req, supabase, auth, branchId);

      // ─── Service bookings lifecycle ───
      case 'list-pending-starts':
        return await listPendingStarts(req, supabase, auth, branchId);
      case 'start-service':
        return await startService(req, supabase, auth, branchId);
      case 'list-in-use':
        return await listInUse(req, supabase, auth, branchId);
      case 'extend-service':
        return await extendService(req, supabase, auth, branchId);
      case 'end-service':
        return await endService(req, supabase, auth, branchId);

      default:
        return errorResponse('Unknown other-services action', 404);
    }
  } catch (err) {
    console.error('Other services error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── List Services ──────────────────────────────────────────────────────────

async function listServices(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';
  const availableOnly = url.searchParams.get('available_only') === 'true';

  let query = supabase
    .from('other_services')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('is_active', true);

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }
  if (availableOnly) {
    query = query.eq('is_available', true);
  }

  query = applyPagination(query, page, pageSize, 'name', true);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ services: data ?? [], total: count ?? 0, page, pageSize });
}

// ─── Create Service ─────────────────────────────────────────────────────────

async function createService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();

  if (!body.name?.trim()) return errorResponse('Service name is required');
  if (!body.charge_amount || Number(body.charge_amount) <= 0) return errorResponse('Charge amount must be positive');
  if (!body.charge_duration) return errorResponse('Charge duration is required');

  // Validate media if provided
  if (body.media_url && body.media_type) {
    if (!['image', 'video'].includes(body.media_type)) {
      return errorResponse('Invalid media type (image or video only)');
    }
  }

  const service = createServiceClient();

  // Check duplicate name
  const { data: existing } = await service
    .from('other_services')
    .select('id')
    .eq('branch_id', branchId)
    .eq('name', body.name.trim())
    .eq('is_active', true)
    .maybeSingle();
  if (existing) return errorResponse(`Service "${body.name}" already exists in this branch`);

  const { data, error } = await service
    .from('other_services')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      name: sanitizeString(body.name),
      description: body.description ? sanitizeString(body.description, 2000) : null,
      charge_amount: Number(body.charge_amount),
      charge_duration: sanitizeString(body.charge_duration),
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? null,
      is_available: body.is_available !== false,
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data }, 201);
}

// ─── Update Service ─────────────────────────────────────────────────────────

async function updateService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = sanitizeString(body.name);
  if (body.description !== undefined) updates.description = body.description ? sanitizeString(body.description, 2000) : null;
  if (body.charge_amount !== undefined) updates.charge_amount = Number(body.charge_amount);
  if (body.charge_duration !== undefined) updates.charge_duration = sanitizeString(body.charge_duration);
  if (body.media_url !== undefined) updates.media_url = body.media_url;
  if (body.media_type !== undefined) updates.media_type = body.media_type;
  if (body.is_available !== undefined) updates.is_available = body.is_available;

  const service = createServiceClient();
  const { data, error } = await service
    .from('other_services')
    .update(updates)
    .eq('id', body.service_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data });
}

// ─── Delete Service (soft delete) ───────────────────────────────────────────

async function deleteService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');

  const service = createServiceClient();
  const { error } = await service
    .from('other_services')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', body.service_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// ─── Toggle Availability ────────────────────────────────────────────────────

async function toggleAvailability(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');
  if (body.is_available === undefined) return errorResponse('Missing is_available');

  const service = createServiceClient();
  const { data, error } = await service
    .from('other_services')
    .update({ is_available: body.is_available, updated_at: new Date().toISOString() })
    .eq('id', body.service_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data });
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Bookings Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

// ─── List Pending Starts ────────────────────────────────────────────────────

async function listPendingStarts(req: Request, _supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';

  const service = createServiceClient();
  let query = service
    .from('service_bookings')
    .select('*, other_services(name, charge_amount, charge_duration, media_url, media_type)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('status', 'pending_start');

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,service_name.ilike.%${search}%,order_number.ilike.%${search}%`);
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ bookings: data ?? [], total: count ?? 0, page, pageSize });
}

// ─── Start Service ──────────────────────────────────────────────────────────

async function startService(req: Request, _supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');

  const service = createServiceClient();

  const { data: booking, error: bErr } = await service
    .from('service_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'pending_start') return errorResponse(`Cannot start — booking is already ${booking.status}`);

  const actualStart = body.actual_start ?? new Date().toISOString();

  // Calculate scheduled_end from actual start + duration if not already set
  let scheduledEnd = booking.scheduled_end;
  if (!scheduledEnd && booking.duration_count && booking.duration_unit) {
    const startDate = new Date(actualStart);
    scheduledEnd = addDuration(startDate, booking.duration_count, booking.duration_unit).toISOString();
  }

  const { data: updated, error: uErr } = await service
    .from('service_bookings')
    .update({
      status: 'in_use',
      actual_start: actualStart,
      scheduled_end: scheduledEnd,
      notes: body.notes ?? booking.notes,
      started_by: auth.userId,
      started_by_name: auth.name,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .select()
    .single();
  if (uErr) return errorResponse(uErr.message);

  return jsonResponse({ booking: updated });
}

// ─── List In-Use ────────────────────────────────────────────────────────────

async function listInUse(req: Request, _supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';

  const service = createServiceClient();
  let query = service
    .from('service_bookings')
    .select('*, other_services(name, charge_amount, charge_duration, media_url, media_type)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('status', 'in_use');

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,service_name.ilike.%${search}%,order_number.ilike.%${search}%`);
  }

  query = applyPagination(query, page, pageSize, 'started_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ bookings: data ?? [], total: count ?? 0, page, pageSize });
}

// ─── Extend Service ─────────────────────────────────────────────────────────

async function extendService(req: Request, _supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');
  if (!body.duration_count || Number(body.duration_count) < 1) return errorResponse('duration_count must be at least 1');

  const service = createServiceClient();

  const { data: booking, error: bErr } = await service
    .from('service_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'in_use') return errorResponse('Can only extend in-use services');

  // Load service for cost info
  const { data: svc } = await service
    .from('other_services')
    .select('id, name, charge_amount, charge_duration')
    .eq('id', booking.service_id)
    .single();
  if (!svc) return errorResponse('Service not found', 404);

  const durationCount = Number(body.duration_count);
  const durationUnit = body.duration_unit ?? svc.charge_duration ?? 'hourly';
  const unitPrice = Number(svc.charge_amount);
  const total = unitPrice * durationCount;

  // Create a new extension order (awaiting_payment)
  const { data: order, error: oErr } = await service
    .from('orders')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      order_type: 'dine_in',
      status: 'awaiting_payment',
      customer_name: booking.customer_name ?? 'Walk In Customer',
      notes: body.notes ?? `Service extension from booking ${booking.order_number}`,
      source: 'pos',
      department: 'other_services',
      subtotal: total,
      total,
      discount_amount: 0,
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select('id, order_number')
    .single();
  if (oErr) return errorResponse(oErr.message);

  // Create extension order item
  const { error: extItemErr } = await service.from('order_items').insert({
    order_id: order.id,
    menu_item_id: null,
    menu_item_name: `${svc.name} — Extension`,
    quantity: durationCount,
    unit_price: unitPrice,
    item_total: total,
    station: 'other_services',
    status: 'pending',
    modifiers: [{
      type: 'service_booking',
      duration_count: durationCount,
      duration_unit: durationUnit,
      extension_of: booking.order_number,
    }],
    selected_extras: [],
  });
  if (extItemErr) return errorResponse(`Failed to save extension order item: ${extItemErr.message}`);

  // Update scheduled_end on the current booking
  if (body.new_end) {
    await service.from('service_bookings')
      .update({ scheduled_end: body.new_end, updated_at: new Date().toISOString() })
      .eq('id', booking.id);
  } else if (booking.scheduled_end) {
    const currentEnd = new Date(booking.scheduled_end);
    const newEnd = addDuration(currentEnd, durationCount, durationUnit);
    await service.from('service_bookings')
      .update({ scheduled_end: newEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', booking.id);
  }

  return jsonResponse({
    extension_order_id: order.id,
    extension_order_number: order.order_number,
    total,
    duration_count: durationCount,
    duration_unit: durationUnit,
  }, 201);
}

// ─── End Service ────────────────────────────────────────────────────────────

async function endService(req: Request, _supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');

  const service = createServiceClient();

  const { data: booking, error: bErr } = await service
    .from('service_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'in_use') return errorResponse(`Cannot end — booking status is ${booking.status}`);

  const actualEnd = body.actual_end ?? new Date().toISOString();

  const { data: updated, error: uErr } = await service
    .from('service_bookings')
    .update({
      status: 'ended',
      actual_end: actualEnd,
      ended_by: auth.userId,
      ended_by_name: auth.name,
      ended_at: new Date().toISOString(),
      notes: body.notes ?? booking.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .select()
    .single();
  if (uErr) return errorResponse(uErr.message);

  return jsonResponse({ booking: updated });
}

// ─── Helper: add duration to date ──────────────────────────────────────────

function addDuration(date: Date, count: number, unit: string): Date {
  const d = new Date(date);
  switch (unit) {
    case 'hourly': case 'hour':
      d.setHours(d.getHours() + count); break;
    case 'daily': case 'day':
      d.setDate(d.getDate() + count); break;
    case 'weekly': case 'week':
      d.setDate(d.getDate() + count * 7); break;
    case 'monthly': case 'month':
      d.setMonth(d.getMonth() + count); break;
    case 'per_session': case 'once':
    default:
      d.setHours(d.getHours() + count); break;
  }
  return d;
}
