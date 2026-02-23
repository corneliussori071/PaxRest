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
          : await upsertRider(req, supabase, auth, branchId);
      case 'deliveries':
        return req.method === 'GET'
          ? await listDeliveries(req, supabase, auth, branchId)
          : errorResponse('Use assign or update-status', 400);
      case 'assign':
        return await assignDelivery(req, supabase, auth, branchId);
      case 'update-status':
        return await updateDeliveryStatus(req, supabase, auth);
      case 'my-deliveries':
        return await getMyDeliveries(req, supabase, auth);
      case 'update-location':
        return await updateRiderLocation(req, supabase, auth);
      default:
        return errorResponse('Unknown delivery action', 404);
    }
  } catch (err) {
    console.error('Delivery error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

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

async function listRiders(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('riders')
    .select('*, profiles(full_name, phone, avatar_url)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (error) return errorResponse(error.message);
  return jsonResponse({ riders: data });
}

async function upsertRider(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();
  if (!body.profile_id) return errorResponse('Missing profile_id');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    profile_id: body.profile_id,
    vehicle_type: body.vehicle_type ?? null,
    vehicle_plate: body.vehicle_plate ?? null,
    is_active: body.is_active ?? true,
    is_online: body.is_online ?? false,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('riders').update(record).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ rider: data });
  } else {
    const { data, error } = await supabase
      .from('riders').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ rider: data }, 201);
  }
}

async function listDeliveries(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('deliveries')
    .select('*, orders(order_number, total, customer_name, customer_phone, customer_address), riders(profiles(full_name, phone))', { count: 'exact' })
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

async function assignDelivery(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_delivery')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.order_id || !body.rider_id) return errorResponse('Missing order_id or rider_id');

  // Check for existing delivery
  const { data: existing } = await supabase
    .from('deliveries')
    .select('id')
    .eq('order_id', body.order_id)
    .not('status', 'eq', 'cancelled')
    .maybeSingle();

  if (existing) return errorResponse('Delivery already assigned for this order', 409);

  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      order_id: body.order_id,
      rider_id: body.rider_id,
      delivery_zone_id: body.delivery_zone_id ?? null,
      status: 'assigned',
      estimated_delivery_time: body.estimated_minutes
        ? new Date(Date.now() + body.estimated_minutes * 60000).toISOString()
        : null,
      assigned_by: auth.userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Record status history
  await supabase.from('delivery_status_history').insert({
    delivery_id: data.id,
    new_status: 'assigned',
    changed_by: auth.userId,
  });

  return jsonResponse({ delivery: data }, 201);
}

async function updateDeliveryStatus(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.delivery_id || !body.new_status) {
    return errorResponse('Missing delivery_id or new_status');
  }

  const updates: Record<string, unknown> = { status: body.new_status };
  if (body.new_status === 'picked_up') updates.picked_up_at = new Date().toISOString();
  if (body.new_status === 'delivered') updates.delivered_at = new Date().toISOString();
  if (body.new_status === 'cancelled') updates.cancelled_at = new Date().toISOString();

  const { data: delivery, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', body.delivery_id)
    .select()
    .single();

  if (error) return errorResponse(error.message);

  await supabase.from('delivery_status_history').insert({
    delivery_id: body.delivery_id,
    old_status: body.old_status ?? null,
    new_status: body.new_status,
    changed_by: auth.userId,
    notes: body.notes ?? null,
    location: body.location ?? null,
  });

  // If delivered, also complete the order
  if (body.new_status === 'delivered' && delivery.order_id) {
    await supabase
      .from('orders')
      .update({ status: 'delivered', completed_at: new Date().toISOString() })
      .eq('id', delivery.order_id);
  }

  return jsonResponse({ delivery });
}

// ─── Rider-specific endpoints ───────────────────────────────────────────────

async function getMyDeliveries(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  // Get rider record for this user
  const { data: rider } = await supabase
    .from('riders')
    .select('id')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  if (!rider) return errorResponse('You are not registered as a rider', 403);

  let query = supabase
    .from('deliveries')
    .select('*, orders(order_number, total, customer_name, customer_phone, customer_address, status)')
    .eq('rider_id', rider.id);

  if (activeOnly) {
    query = query.in('status', ['assigned', 'picked_up', 'in_transit']);
  }

  query = query.order('created_at', { ascending: false }).limit(50);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ deliveries: data });
}

async function updateRiderLocation(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.latitude || !body.longitude) return errorResponse('Missing latitude or longitude');

  const { data: rider } = await supabase
    .from('riders')
    .select('id')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  if (!rider) return errorResponse('Not a rider', 403);

  const { error } = await supabase
    .from('riders')
    .update({
      current_location: { lat: body.latitude, lng: body.longitude },
      last_location_update: new Date().toISOString(),
    })
    .eq('id', rider.id);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true });
}
