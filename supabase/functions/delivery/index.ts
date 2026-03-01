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
      case 'zones':
        return req.method === 'GET'
          ? await listZones(supabase, auth, branchId)
          : await upsertZone(req, supabase, auth, branchId);
      case 'riders':
        return req.method === 'GET'
          ? await listRiders(supabase, auth, branchId)
          : await upsertRiderVehicle(req, supabase, auth, branchId);
      case 'toggle-availability':
        return await toggleAvailability(req, supabase, auth);
      case 'deliveries':
        return req.method === 'GET'
          ? await listDeliveries(req, supabase, auth, branchId)
          : errorResponse('Use assign or update-status', 400);
      case 'assign':
        return await assignDelivery(req, supabase, auth, branchId);
      case 'reassign':
        return await reassignDelivery(req, supabase, auth);
      case 'update-status':
        return await updateDeliveryStatus(req, supabase, auth);
      case 'my-deliveries':
      case 'my-assignments':
        return await getMyDeliveries(req, supabase, auth);
      case 'accept-assignment':
        return await acceptAssignment(req, supabase, auth);
      case 'decline-assignment':
        return await declineAssignment(req, supabase, auth);
      case 'update-location':
        return await updateRiderLocation(req, supabase, auth);
      default:
        return errorResponse('Unknown delivery action', 404);
    }
  } catch (err: any) {
    console.error('Delivery error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ZONES

async function listZones(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('branch_id', branchId)
    .order('name', { ascending: true });
  if (error) return errorResponse(error.message);
  return jsonResponse({ zones: data });
}

async function upsertZone(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();
  if (!body.name) return errorResponse('Missing zone name');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    polygon: body.polygon ?? null,
    delivery_fee: body.delivery_fee ?? 0,
    min_order_amount: body.min_order_amount ?? 0,
    estimated_minutes: body.estimated_minutes ?? 30,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('delivery_zones').update(record).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ zone: data });
  } else {
    const { data, error } = await supabase
      .from('delivery_zones').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ zone: data }, 201);
  }
}

// RIDERS

async function listRiders(supabase: any, auth: AuthContext, branchId: string) {
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, phone, is_active, avatar_url')
    .eq('company_id', auth.companyId)
    .eq('role', 'rider')
    .contains('branch_ids', [branchId])
    .order('name', { ascending: true });

  if (profileErr) return errorResponse(profileErr.message);
  if (!profiles || profiles.length === 0) return jsonResponse({ riders: [], items: [], total: 0 });

  const profileIds = profiles.map((p: any) => p.id);

  const { data: riderExtras } = await supabase
    .from('riders')
    .select('id, vehicle_type, license_plate, is_available, is_on_delivery, active_deliveries_count, max_concurrent_deliveries, total_deliveries')
    .in('id', profileIds);

  const extrasMap = new Map((riderExtras ?? []).map((r: any) => [r.id, r]));

  const riders = profiles.map((p: any) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    avatar_url: p.avatar_url,
    is_active: p.is_active,
    vehicle_type: extrasMap.get(p.id)?.vehicle_type ?? 'motorcycle',
    license_plate: extrasMap.get(p.id)?.license_plate ?? null,
    is_available: extrasMap.get(p.id)?.is_available ?? true,
    is_on_delivery: extrasMap.get(p.id)?.is_on_delivery ?? false,
    active_deliveries_count: extrasMap.get(p.id)?.active_deliveries_count ?? 0,
    max_concurrent_deliveries: extrasMap.get(p.id)?.max_concurrent_deliveries ?? 3,
    total_deliveries: extrasMap.get(p.id)?.total_deliveries ?? 0,
  }));

  return jsonResponse({ riders, items: riders, total: riders.length });
}

async function upsertRiderVehicle(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing rider id');

  const { data: existing } = await supabase
    .from('riders').select('id').eq('id', body.id).maybeSingle();

  if (!existing) {
    const { data: profile } = await supabase
      .from('profiles').select('id, name, phone').eq('id', body.id).single();
    if (!profile) return errorResponse('Profile not found', 404);
    await supabase.from('riders').insert({
      id: profile.id, company_id: auth.companyId, branch_id: branchId,
      name: profile.name, phone: profile.phone ?? '',
    });
  }

  const { data, error } = await supabase
    .from('riders')
    .update({
      vehicle_type: body.vehicle_type ?? 'motorcycle',
      license_plate: body.license_plate ?? null,
      max_concurrent_deliveries: body.max_concurrent_deliveries ?? 3,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select().single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ rider: data });
}

async function toggleAvailability(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  const riderId = body.rider_id ?? auth.userId;
  const isStaffAction = body.rider_id && body.rider_id !== auth.userId;
  if (isStaffAction && !hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);

  const { data: existing } = await supabase
    .from('riders').select('id, is_available').eq('id', riderId).maybeSingle();

  if (!existing) return errorResponse('Rider record not found', 404);

  const newAvailability = body.is_available !== undefined ? body.is_available : !existing.is_available;

  const { data, error } = await supabase
    .from('riders')
    .update({ is_available: newAvailability, updated_at: new Date().toISOString() })
    .eq('id', riderId)
    .select('id, is_available').single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ rider: data });
}

// DELIVERIES

async function listDeliveries(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('deliveries')
    .select(
      '*, orders(order_number, total, customer_name, customer_phone, customer_address), rider:riders!deliveries_rider_id_fkey(id, name, phone, vehicle_type, license_plate, is_available)',
      { count: 'exact' }
    )
    .eq('branch_id', branchId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const riderId = url.searchParams.get('rider_id');
  if (riderId) query = query.eq('rider_id', riderId);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function assignDelivery(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();
  if (!body.order_id) return errorResponse('Missing order_id');

  const { data: existing } = await supabase
    .from('deliveries').select('id').eq('order_id', body.order_id)
    .not('status', 'eq', 'cancelled').maybeSingle();
  if (existing) return errorResponse('A delivery already exists for this order', 409);

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_phone, customer_address, total')
    .eq('id', body.order_id).single();
  if (orderErr || !order) return errorResponse('Order not found', 404);

  let riderId: string | null = body.rider_id ?? null;
  let assignmentType = 'manual';

  if (body.auto_assign || !riderId) {
    assignmentType = 'auto';
    riderId = await pickLeastBusyRider(supabase, branchId);
    if (!riderId) return errorResponse('No available riders at this time', 422);
  }

  let riderName: string | null = null;
  if (riderId) {
    const { data: rider } = await supabase.from('riders').select('name').eq('id', riderId).single();
    riderName = rider?.name ?? null;
  }

  let estimatedTime: string | null = null;
  if (body.delivery_zone_id) {
    const { data: zone } = await supabase
      .from('delivery_zones').select('estimated_minutes').eq('id', body.delivery_zone_id).single();
    if (zone?.estimated_minutes) {
      estimatedTime = new Date(Date.now() + zone.estimated_minutes * 60000).toISOString();
    }
  }

  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      order_id: order.id,
      order_number: order.order_number,
      rider_id: riderId,
      rider_name: riderName,
      delivery_zone_id: body.delivery_zone_id ?? null,
      status: riderId ? 'assigned' : 'pending_assignment',
      assignment_type: assignmentType,
      delivery_fee: body.delivery_fee ?? 0,
      delivery_address: order.customer_address ?? null,
      pickup_address: body.pickup_address ?? '',
      customer_name: order.customer_name ?? '',
      customer_phone: order.customer_phone ?? '',
      notes: body.notes ?? null,
      estimated_delivery_time: estimatedTime,
      assigned_by: auth.userId,
      rider_response: riderId ? 'pending' : null,
    })
    .select().single();

  if (error) return errorResponse(error.message);

  await supabase.from('delivery_status_history').insert({
    delivery_id: data.id,
    new_status: data.status,
    changed_by: auth.userId,
    changed_by_name: auth.name ?? null,
  });

  if (riderId) {
    await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', order.id);
  }

  return jsonResponse({ delivery: data }, 201);
}

async function reassignDelivery(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();
  if (!body.delivery_id || !body.rider_id) return errorResponse('Missing delivery_id or rider_id');

  const { data: rider } = await supabase.from('riders').select('name').eq('id', body.rider_id).single();

  const { data, error } = await supabase
    .from('deliveries')
    .update({
      rider_id: body.rider_id, rider_name: rider?.name ?? null,
      status: 'assigned', rider_response: 'pending', decline_reason: null, assigned_by: auth.userId,
    })
    .eq('id', body.delivery_id).select().single();

  if (error) return errorResponse(error.message);

  await supabase.from('delivery_status_history').insert({
    delivery_id: body.delivery_id, new_status: 'assigned',
    changed_by: auth.userId, changed_by_name: auth.name ?? null,
    notes: `Reassigned to ${rider?.name ?? body.rider_id}`,
  });

  return jsonResponse({ delivery: data });
}

async function updateDeliveryStatus(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.delivery_id || !body.new_status) return errorResponse('Missing delivery_id or new_status');

  const updates: Record<string, unknown> = { status: body.new_status, updated_at: new Date().toISOString() };
  if (body.new_status === 'picked_up') updates.actual_pickup_time = new Date().toISOString();
  if (body.new_status === 'delivered') updates.actual_delivery_time = new Date().toISOString();

  const { data: delivery, error } = await supabase
    .from('deliveries').update(updates).eq('id', body.delivery_id).select().single();
  if (error) return errorResponse(error.message);

  await supabase.from('delivery_status_history').insert({
    delivery_id: body.delivery_id,
    old_status: body.old_status ?? null,
    new_status: body.new_status,
    changed_by: auth.userId,
    changed_by_name: auth.name ?? null,
    notes: body.notes ?? null,
    location: body.location ?? null,
  });

  if (body.new_status === 'delivered' && delivery.order_id) {
    await supabase.from('orders')
      .update({ status: 'delivered', completed_at: new Date().toISOString() })
      .eq('id', delivery.order_id);
  }

  return jsonResponse({ delivery });
}

// RIDER-FACING

async function getMyDeliveries(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let query = supabase
    .from('deliveries')
    .select('*, orders(order_number, total, customer_name, customer_phone, customer_address, status)')
    .eq('rider_id', auth.userId);

  if (activeOnly) query = query.in('status', ['assigned', 'picked_up', 'in_transit']);

  query = query.order('created_at', { ascending: false }).limit(50);
  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ deliveries: data });
}

async function acceptAssignment(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.delivery_id) return errorResponse('Missing delivery_id');

  const { data, error } = await supabase
    .from('deliveries')
    .update({ rider_response: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', body.delivery_id).eq('rider_id', auth.userId).select().single();

  if (error) return errorResponse(error.message);
  if (!data) return errorResponse('Delivery not found or not assigned to you', 404);

  await supabase.from('delivery_status_history').insert({
    delivery_id: body.delivery_id, new_status: data.status,
    changed_by: auth.userId, notes: 'Rider accepted assignment',
  });

  return jsonResponse({ delivery: data });
}

async function declineAssignment(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.delivery_id) return errorResponse('Missing delivery_id');

  const { data, error } = await supabase
    .from('deliveries')
    .update({
      rider_response: 'declined', decline_reason: body.reason ?? null,
      status: 'pending_assignment', rider_id: null, rider_name: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.delivery_id).eq('rider_id', auth.userId).select().single();

  if (error) return errorResponse(error.message);
  if (!data) return errorResponse('Delivery not found or not assigned to you', 404);

  await supabase.from('delivery_status_history').insert({
    delivery_id: body.delivery_id, new_status: 'pending_assignment',
    changed_by: auth.userId,
    notes: `Rider declined: ${body.reason ?? 'no reason given'}`,
  });

  return jsonResponse({ delivery: data });
}

async function updateRiderLocation(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.latitude || !body.longitude) return errorResponse('Missing latitude or longitude');

  const { error } = await supabase
    .from('riders')
    .update({ current_location: { lat: body.latitude, lng: body.longitude, updated_at: new Date().toISOString() } })
    .eq('id', auth.userId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true });
}

// HELPERS

async function pickLeastBusyRider(supabase: any, branchId: string): Promise<string | null> {
  const { data } = await supabase
    .from('riders')
    .select('id, active_deliveries_count')
    .eq('branch_id', branchId)
    .eq('is_available', true)
    .eq('is_active', true)
    .eq('is_on_delivery', false)
    .order('active_deliveries_count', { ascending: true })
    .limit(1).maybeSingle();
  return data?.id ?? null;
}
