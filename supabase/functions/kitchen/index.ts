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
      // ─── Existing KDS actions ───
      case 'orders':
        return await getKitchenOrders(req, supabase, auth, branchId);
      case 'update-item':
        return await updateItemStatus(req, supabase, auth);
      case 'bump':
        return await bumpOrder(req, supabase, auth);
      case 'recall':
        return await recallOrder(req, supabase, auth);

      // ─── New: Meal Assignments (Make a Dish) ───
      case 'assignments':
        return req.method === 'GET'
          ? await listAssignments(req, supabase, auth, branchId)
          : await createAssignment(req, supabase, auth, branchId);
      case 'assignment-respond':
        return await respondAssignment(req, supabase, auth, branchId);
      case 'assignment-complete':
        return await completeAssignment(req, supabase, auth, branchId);
      case 'assignment-update':
        return await updateAssignment(req, supabase, auth, branchId);
      case 'assignment-delete':
        return await deleteAssignment(req, supabase, auth, branchId);
      case 'staff-chefs':
        return await listChefs(req, supabase, auth, branchId);

      // ─── New: Available Meals ───
      case 'available-meals':
        return req.method === 'GET'
          ? await listAvailableMeals(req, supabase, auth, branchId)
          : await updateAvailableMeal(req, supabase, auth, branchId);

      // ─── New: Menu Availability ───
      case 'update-availability':
        return await updateMenuAvailability(req, supabase, auth, branchId);

      // ─── New: Kitchen Stats ───
      case 'stats':
        return await getKitchenStats(supabase, auth, branchId);

      default:
        return errorResponse('Unknown kitchen action', 404);
    }
  } catch (err) {
    console.error('Kitchen error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── Get Kitchen Orders (filtered by station) ──────────────────────────────

async function getKitchenOrders(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const station = url.searchParams.get('station') ?? 'kitchen';
  const statusFilter = url.searchParams.get('status'); // 'active' or 'completed'

  const orderStatuses = statusFilter === 'completed'
    ? ['completed', 'ready', 'served']
    : ['pending', 'confirmed', 'preparing'];

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_type, table_id, customer_name, notes, created_at, status, source,
      order_items(id, menu_item_name, variant_name, quantity, special_instructions, station, status, modifiers, removed_ingredients, selected_extras),
      tables(name)
    `)
    .eq('branch_id', branchId)
    .in('status', orderStatuses)
    .order('created_at', { ascending: statusFilter !== 'completed' })
    .limit(statusFilter === 'completed' ? 50 : 100);

  if (error) return errorResponse(error.message);

  // Filter orders that have items for this station
  const now = new Date();
  const filtered = (orders ?? [])
    .map((order: any) => ({
      order_id: order.id,
      order_number: order.order_number,
      order_type: order.order_type,
      source: order.source,
      table_name: order.tables?.name ?? null,
      customer_name: order.customer_name,
      notes: order.notes,
      status: order.status,
      created_at: order.created_at,
      elapsed_minutes: Math.round((now.getTime() - new Date(order.created_at).getTime()) / 60000),
      items: order.order_items
        .filter((item: any) => item.station === station && item.status !== 'cancelled')
        .map((item: any) => ({
          ...item,
          modifiers: item.modifiers ?? [],
          removed_ingredients: item.removed_ingredients ?? [],
          selected_extras: item.selected_extras ?? [],
        })),
    }))
    .filter((order: any) => order.items.length > 0);

  return jsonResponse({ orders: filtered });
}

// ─── Update Individual Item Status ──────────────────────────────────────────

async function updateItemStatus(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.item_id || !body.new_status) {
    return errorResponse('Missing item_id or new_status');
  }

  const validStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
  if (!validStatuses.includes(body.new_status)) {
    return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const updates: Record<string, unknown> = { status: body.new_status };
  if (body.new_status === 'ready') {
    updates.prepared_by = auth.userId;
    updates.prepared_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('order_items')
    .update(updates)
    .eq('id', body.item_id)
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Check if all items in the order are ready → auto-update order status
  if (body.new_status === 'ready') {
    await checkAndUpdateOrderStatus(supabase, data.order_id);
  }

  return jsonResponse({ item: data });
}

// ─── Bump Order (mark all items as ready) ───────────────────────────────────

async function bumpOrder(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.order_id) return errorResponse('Missing order_id');
  const station = body.station ?? 'kitchen';

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'ready', prepared_by: auth.userId, prepared_at: now })
    .eq('order_id', body.order_id)
    .eq('station', station)
    .in('status', ['pending', 'preparing']);

  if (error) return errorResponse(error.message);
  await checkAndUpdateOrderStatus(supabase, body.order_id);
  return jsonResponse({ bumped: true });
}

// ─── Recall Order ───────────────────────────────────────────────────────────

async function recallOrder(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.order_id) return errorResponse('Missing order_id');

  await supabase
    .from('order_items')
    .update({ status: 'preparing', prepared_at: null })
    .eq('order_id', body.order_id)
    .eq('status', 'ready');

  await supabase
    .from('orders')
    .update({ status: 'preparing' })
    .eq('id', body.order_id)
    .eq('status', 'ready');

  return jsonResponse({ recalled: true });
}

// ─── Helper: Check & Update Order Status ────────────────────────────────────

async function checkAndUpdateOrderStatus(supabase: any, orderId: string) {
  const { data: items } = await supabase
    .from('order_items')
    .select('status')
    .eq('order_id', orderId)
    .neq('status', 'cancelled');

  const allReady = items?.every((item: any) => item.status === 'ready' || item.status === 'served');
  if (allReady) {
    await supabase
      .from('orders')
      .update({ status: 'ready' })
      .eq('id', orderId)
      .in('status', ['pending', 'confirmed', 'preparing']);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Meal Assignments (Make a Dish workflow)
// ═══════════════════════════════════════════════════════════════════════════

async function listAssignments(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const status = url.searchParams.get('status');
  const myOnly = url.searchParams.get('my_only') === 'true';

  let query = supabase
    .from('meal_assignments')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  if (status) query = query.eq('status', status);
  if (myOnly) query = query.eq('assigned_to', auth.userId);

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

async function createAssignment(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'view_kitchen') && !hasPermission(auth, 'manage_menu')) {
    return errorResponse('Forbidden', 403);
  }
  const body = await req.json();

  // For batch mode, items array is required; for single mode, menu_item_id + menu_item_name
  if (!body.items && (!body.menu_item_id || !body.menu_item_name)) {
    return errorResponse('Missing items array, or menu_item_id/menu_item_name');
  }

  // Support batch creation (array of items)
  const items = Array.isArray(body.items) ? body.items : [body];
  const created: any[] = [];

  for (const item of items) {
    const mid = item.menu_item_id ?? body.menu_item_id;
    const mname = item.menu_item_name ?? body.menu_item_name;
    if (!mid || !mname) continue;

    const { data, error } = await supabase
      .from('meal_assignments')
      .insert({
        company_id: auth.companyId,
        branch_id: branchId,
        menu_item_id: mid,
        menu_item_name: sanitizeString(mname),
        assigned_to: item.assigned_to ?? body.assigned_to ?? auth.userId,
        assigned_to_name: item.assigned_to_name ?? body.assigned_to_name ?? auth.email,
        assigned_by: auth.userId,
        assigned_by_name: body.assigned_by_name ?? auth.email,
        quantity: item.quantity ?? body.quantity ?? 1,
        status: 'pending',
        notes: item.notes ? sanitizeString(item.notes) : (body.notes ? sanitizeString(body.notes) : null),
        station: item.station ?? body.station ?? 'kitchen',
        expected_completion_time: item.expected_completion_time ?? body.expected_completion_time ?? null,
        excluded_ingredients: item.excluded_ingredients ?? [],
        excluded_extras: item.excluded_extras ?? [],
      })
      .select()
      .single();

    if (error) return errorResponse(error.message);
    created.push(data);
  }

  return jsonResponse({ assignments: created }, 201);
}

async function respondAssignment(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.assignment_id || !body.status) {
    return errorResponse('Missing assignment_id or status');
  }

  if (!['accepted', 'rejected', 'in_progress'].includes(body.status)) {
    return errorResponse('Invalid status. Must be accepted, rejected, or in_progress');
  }

  const updates: Record<string, unknown> = { status: body.status };
  if (body.status === 'accepted' || body.status === 'in_progress') {
    updates.started_at = new Date().toISOString();
  }
  if (body.status === 'rejected' && body.rejection_reason) {
    updates.rejection_reason = sanitizeString(body.rejection_reason);
  }

  const { error } = await supabase
    .from('meal_assignments')
    .update(updates)
    .eq('id', body.assignment_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true });
}

async function completeAssignment(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.assignment_id) return errorResponse('Missing assignment_id');

  // Get the assignment
  const { data: assignment, error: fetchErr } = await supabase
    .from('meal_assignments')
    .select('*')
    .eq('id', body.assignment_id)
    .eq('branch_id', branchId)
    .single();

  if (fetchErr || !assignment) return errorResponse('Assignment not found', 404);

  const quantityCompleted = body.quantity_completed ?? assignment.quantity;

  // Update assignment status
  const { error: updateErr } = await supabase
    .from('meal_assignments')
    .update({
      status: 'completed',
      quantity_completed: quantityCompleted,
      completed_at: new Date().toISOString(),
    })
    .eq('id', body.assignment_id);

  if (updateErr) return errorResponse(updateErr.message);

  // Upsert available_meals — increment quantity
  const { data: existing } = await supabase
    .from('available_meals')
    .select('id, quantity_available')
    .eq('branch_id', branchId)
    .eq('menu_item_id', assignment.menu_item_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('available_meals')
      .update({
        quantity_available: existing.quantity_available + quantityCompleted,
        prepared_by: auth.userId,
        prepared_by_name: body.prepared_by_name ?? auth.email,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('available_meals')
      .insert({
        company_id: auth.companyId,
        branch_id: branchId,
        menu_item_id: assignment.menu_item_id,
        menu_item_name: assignment.menu_item_name,
        quantity_available: quantityCompleted,
        prepared_by: auth.userId,
        prepared_by_name: body.prepared_by_name ?? auth.email,
        station: assignment.station,
      });
  }

  return jsonResponse({ completed: true, quantity_completed: quantityCompleted });
}

// ─── Update Assignment ──────────────────────────────────────────────────────

async function updateAssignment(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'view_kitchen') && !hasPermission(auth, 'manage_menu')) {
    return errorResponse('Forbidden', 403);
  }
  const body = await req.json();
  if (!body.assignment_id) return errorResponse('Missing assignment_id');

  const updates: Record<string, unknown> = {};
  if (body.assigned_to) updates.assigned_to = body.assigned_to;
  if (body.assigned_to_name) updates.assigned_to_name = sanitizeString(body.assigned_to_name);
  if (body.quantity) updates.quantity = body.quantity;
  if (body.notes !== undefined) updates.notes = body.notes ? sanitizeString(body.notes) : null;
  if (body.expected_completion_time !== undefined) updates.expected_completion_time = body.expected_completion_time;
  if (body.station) updates.station = body.station;

  if (Object.keys(updates).length === 0) return errorResponse('No fields to update');

  const { error } = await supabase
    .from('meal_assignments')
    .update(updates)
    .eq('id', body.assignment_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true });
}

// ─── Delete Assignment ──────────────────────────────────────────────────────

async function deleteAssignment(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'view_kitchen') && !hasPermission(auth, 'manage_menu')) {
    return errorResponse('Forbidden', 403);
  }
  const body = await req.json();
  if (!body.assignment_id) return errorResponse('Missing assignment_id');

  const { error } = await supabase
    .from('meal_assignments')
    .delete()
    .eq('id', body.assignment_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deleted: true });
}

// ─── List Chefs (staff with kitchen roles) ──────────────────────────────────

async function listChefs(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  // Fetch staff who can work in kitchen (chef, head_chef, cook, etc.)
  const { data: staff, error } = await supabase
    .from('company_staff')
    .select('user_id, role, profiles(id, full_name, email)')
    .eq('company_id', auth.companyId)
    .in('role', ['chef', 'head_chef', 'cook', 'kitchen_staff', 'manager', 'owner', 'general_manager']);

  if (error) return errorResponse(error.message);

  // Also count active assignments per chef
  const { data: counts } = await supabase
    .from('meal_assignments')
    .select('assigned_to')
    .eq('branch_id', branchId)
    .in('status', ['pending', 'accepted', 'in_progress']);

  const assignmentCounts: Record<string, number> = {};
  (counts ?? []).forEach((c: any) => {
    assignmentCounts[c.assigned_to] = (assignmentCounts[c.assigned_to] ?? 0) + 1;
  });

  const chefs = (staff ?? []).map((s: any) => ({
    user_id: s.user_id,
    name: s.profiles?.full_name ?? s.profiles?.email ?? 'Unknown',
    role: s.role,
    active_assignments: assignmentCounts[s.user_id] ?? 0,
  }));

  return jsonResponse({ chefs });
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Available Meals
// ═══════════════════════════════════════════════════════════════════════════

async function listAvailableMeals(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('available_meals')
    .select('*')
    .eq('branch_id', branchId)
    .gt('quantity_available', 0)
    .order('menu_item_name', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ items: data });
}

async function updateAvailableMeal(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.menu_item_id) return errorResponse('Missing menu_item_id');

  if (body.action === 'decrement') {
    // When POS sells an available meal, decrement quantity
    const { data: existing } = await supabase
      .from('available_meals')
      .select('id, quantity_available')
      .eq('branch_id', branchId)
      .eq('menu_item_id', body.menu_item_id)
      .maybeSingle();

    if (!existing || existing.quantity_available <= 0) {
      return errorResponse('No available meals to sell', 400);
    }

    const newQty = existing.quantity_available - (body.quantity ?? 1);
    const { error } = await supabase
      .from('available_meals')
      .update({ quantity_available: Math.max(0, newQty) })
      .eq('id', existing.id);

    if (error) return errorResponse(error.message);
    return jsonResponse({ quantity_available: Math.max(0, newQty) });
  }

  if (body.action === 'set') {
    // Manually set quantity
    const { error } = await supabase
      .from('available_meals')
      .upsert({
        company_id: auth.companyId,
        branch_id: branchId,
        menu_item_id: body.menu_item_id,
        menu_item_name: body.menu_item_name ?? '',
        quantity_available: body.quantity ?? 0,
        station: body.station ?? 'kitchen',
      }, { onConflict: 'branch_id,menu_item_id' })
      .select();

    if (error) return errorResponse(error.message);
    return jsonResponse({ updated: true });
  }

  return errorResponse('Invalid action. Use "decrement" or "set"');
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Menu Availability
// ═══════════════════════════════════════════════════════════════════════════

async function updateMenuAvailability(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'view_kitchen') && !hasPermission(auth, 'manage_menu')) {
    return errorResponse('Forbidden', 403);
  }
  const body = await req.json();

  if (!body.menu_item_id || !body.availability_status) {
    return errorResponse('Missing menu_item_id or availability_status');
  }

  const validStatuses = ['available', 'low', 'sold_out'];
  if (!validStatuses.includes(body.availability_status)) {
    return errorResponse('Invalid availability_status');
  }

  const updates: Record<string, unknown> = {
    availability_status: body.availability_status,
  };

  // If sold out, also set is_available to false
  if (body.availability_status === 'sold_out') {
    updates.is_available = false;
  } else {
    updates.is_available = true;
  }

  const { error } = await supabase
    .from('menu_items')
    .update(updates)
    .eq('id', body.menu_item_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Kitchen Stats
// ═══════════════════════════════════════════════════════════════════════════

async function getKitchenStats(supabase: any, auth: AuthContext, branchId: string) {
  const [ordersRes, assignmentsRes, mealsRes, requestsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .in('status', ['pending', 'confirmed', 'preparing']),
    supabase
      .from('meal_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .in('status', ['pending', 'accepted', 'in_progress']),
    supabase
      .from('available_meals')
      .select('quantity_available')
      .eq('branch_id', branchId)
      .gt('quantity_available', 0),
    supabase
      .from('ingredient_requests')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'pending'),
  ]);

  const totalMeals = (mealsRes.data ?? []).reduce(
    (sum: number, m: any) => sum + (m.quantity_available ?? 0), 0
  );

  return jsonResponse({
    pending_orders: ordersRes.count ?? 0,
    active_assignments: assignmentsRes.count ?? 0,
    available_meals_count: totalMeals,
    pending_requests: requestsRes.count ?? 0,
  });
}
