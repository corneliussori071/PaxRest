import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId,
  validatePagination, applyPagination, sanitizeString,
  validateMediaFile,
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

    const canAccom = (perm: string) =>
      hasPermission(auth, perm) || hasPermission(auth, 'view_accommodation') || hasPermission(auth, 'manage_menu');

    switch (action) {
      // ─── Rooms ───
      case 'create-room':
        return await createRoom(req, supabase, auth, branchId);
      case 'update-room':
        return await updateRoom(req, supabase, auth, branchId);
      case 'list-rooms':
        return await listRooms(req, supabase, auth, branchId);
      case 'room-detail':
        return await roomDetail(req, supabase, auth, branchId);
      case 'delete-room':
        return await deleteRoom(req, supabase, auth, branchId);

      // ─── Accommodation Internal Store ───
      case 'internal-store':
        return await listInternalStore(req, supabase, auth, branchId);
      case 'internal-store-update-price':
        return await updateStoreItemPrice(req, supabase, auth, branchId);
      case 'internal-store-movements':
        return await listInternalMovements(req, supabase, auth, branchId);
      case 'internal-store-sales':
        return await listInternalSales(req, supabase, auth, branchId);
      case 'internal-store-staff':
        return await listAccomStaff(req, supabase, auth, branchId);

      // ─── Accommodation Orders ───
      case 'create-order':
        return await createAccomOrder(req, supabase, auth, branchId);
      case 'pending-orders':
        return await listAccomOrders(req, supabase, auth, branchId, ['pending', 'confirmed', 'preparing', 'ready']);
      case 'mark-served':
        return await markServed(req, supabase, auth, branchId);
      case 'awaiting-payment':
        return await listAccomOrders(req, supabase, auth, branchId, ['awaiting_payment']);
      case 'order-detail':
        return await getOrderDetail(req, supabase, auth, branchId);

      // ─── Barcode lookup ───
      case 'barcode-lookup':
        return await barcodeLookup(req, supabase, auth, branchId);

      // ─── Room occupancy ───
      case 'free-room':
        return await freeRoom(req, supabase, auth, branchId);

      // ─── Guest lifecycle ───
      case 'list-pending-checkins':
        return await listPendingCheckins(req, supabase, auth, branchId);
      case 'checkin-guest':
        return await checkinGuest(req, supabase, auth, branchId);
      case 'list-instay':
        return await listInstay(req, supabase, auth, branchId);
      case 'depart-guest':
        return await departGuest(req, supabase, auth, branchId);
      case 'transfer-guest':
        return await transferGuest(req, supabase, auth, branchId);
      case 'extend-stay':
        return await extendStay(req, supabase, auth, branchId);

      default:
        return errorResponse('Unknown accommodation action', 404);
    }
  } catch (err) {
    console.error('Accommodation error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Derive the correct room status from its occupancy numbers.
 * - 0 occupants            → 'available'
 * - 0 < occupants < max   → 'partially_occupied'
 * - occupants >= max       → 'occupied'
 */
function calcRoomStatus(currentOccupants: number, maxOccupants: number): string {
  if (currentOccupants <= 0) return 'available';
  if (currentOccupants >= maxOccupants) return 'occupied';
  return 'partially_occupied';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Rooms CRUD
   ═══════════════════════════════════════════════════════════════════════════ */

async function createRoom(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.room_number) return errorResponse('Room number is required');
  if (!body.cost_amount || body.cost_amount <= 0) return errorResponse('Cost amount must be positive');
  if (!body.cost_duration) return errorResponse('Cost duration is required');
  if (!body.max_occupants || body.max_occupants < 1) return errorResponse('Max occupants must be at least 1');

  // Validate media if provided
  if (body.media_url && body.media_type) {
    if (!['image', 'video'].includes(body.media_type)) {
      return errorResponse('Invalid media type (image or video only)');
    }
  }

  const service = createServiceClient();

  // Check duplicate room number
  const { data: existing } = await service
    .from('rooms')
    .select('id')
    .eq('branch_id', branchId)
    .eq('room_number', body.room_number)
    .maybeSingle();
  if (existing) return errorResponse(`Room "${body.room_number}" already exists in this branch`);

  const { data, error } = await service
    .from('rooms')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      room_number: sanitizeString(body.room_number),
      floor_section: body.floor_section ? sanitizeString(body.floor_section) : null,
      max_occupants: Number(body.max_occupants),
      category: sanitizeString(body.category ?? 'regular'),
      cost_amount: Number(body.cost_amount),
      cost_duration: body.cost_duration, // night, day, hour
      benefits: body.benefits ?? [],
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? null,
      status: 'available',
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ room: data }, 201);
}

async function updateRoom(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.room_id) return errorResponse('Missing room_id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.room_number !== undefined) updates.room_number = sanitizeString(body.room_number);
  if (body.floor_section !== undefined) updates.floor_section = body.floor_section ? sanitizeString(body.floor_section) : null;
  if (body.max_occupants !== undefined) updates.max_occupants = Number(body.max_occupants);
  if (body.category !== undefined) updates.category = sanitizeString(body.category);
  if (body.cost_amount !== undefined) updates.cost_amount = Number(body.cost_amount);
  if (body.cost_duration !== undefined) updates.cost_duration = body.cost_duration;
  if (body.benefits !== undefined) updates.benefits = body.benefits;
  if (body.media_url !== undefined) updates.media_url = body.media_url;
  if (body.media_type !== undefined) updates.media_type = body.media_type;
  if (body.status !== undefined) updates.status = body.status;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const service = createServiceClient();
  const { data, error } = await service
    .from('rooms')
    .update(updates)
    .eq('id', body.room_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ room: data });
}

async function listRooms(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';
  const status = url.searchParams.get('status');

  let query = supabase
    .from('rooms')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('is_active', true);

  if (search) {
    query = query.or(`room_number.ilike.%${search}%,floor_section.ilike.%${search}%,category.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq('status', status);
  }

  query = applyPagination(query, page, pageSize, 'room_number', true);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ rooms: data ?? [], total: count ?? 0, page, pageSize });
}

async function roomDetail(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing room id');

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ room: data });
}

async function deleteRoom(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.room_id) return errorResponse('Missing room_id');

  const service = createServiceClient();
  const { error } = await service
    .from('rooms')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', body.room_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Accommodation Internal Store
   ═══════════════════════════════════════════════════════════════════════════ */

async function listInternalStore(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';

  let query = supabase
    .from('accom_store_items')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  if (search) {
    query = query.or(`item_name.ilike.%${search}%,barcode.ilike.%${search}%`);
  }

  query = applyPagination(query, page, pageSize, 'item_name', true);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data ?? [], total: count ?? 0, page, pageSize });
}

async function updateStoreItemPrice(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.accom_store_item_id) return errorResponse('Missing accom_store_item_id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.selling_price !== undefined) updates.selling_price = body.selling_price;
  if (body.barcode !== undefined) updates.barcode = body.barcode;

  const service = createServiceClient();
  const { data, error } = await service
    .from('accom_store_items')
    .update(updates)
    .eq('id', body.accom_store_item_id)
    .eq('branch_id', branchId)
    .select()
    .single();
  if (error) return errorResponse(error.message);
  return jsonResponse({ item: data });
}

async function barcodeLookup(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const barcode = url.searchParams.get('barcode');
  if (!barcode) return errorResponse('Missing barcode');

  const { data, error } = await supabase
    .from('accom_store_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('barcode', barcode)
    .gt('quantity', 0)
    .single();

  if (error) return jsonResponse({ item: null });
  return jsonResponse({ item: data });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Accommodation Orders
   ═══════════════════════════════════════════════════════════════════════════ */

async function createAccomOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json();
  if (!body.items || body.items.length === 0) return errorResponse('No items in order');
  // customer_name is optional — defaults to 'Walk In Customer'

  const service = createServiceClient();

  const orderItems: any[] = [];
  const saleRecords: any[] = [];
  const movementRecords: any[] = [];

  for (const item of body.items) {
    if (item.source === 'accom_store') {
      // Accommodation internal store item
      const { data: storeItem, error: sErr } = await service
        .from('accom_store_items')
        .select('id, quantity, selling_price, item_name, unit, inventory_item_id')
        .eq('id', item.accom_store_item_id)
        .eq('branch_id', branchId)
        .single();
      if (sErr || !storeItem) return errorResponse(`Item not found: ${item.name ?? item.accom_store_item_id}`);

      const qty = Number(item.quantity);
      const qtyBefore = Number(storeItem.quantity);
      if (qty > qtyBefore) return errorResponse(`Insufficient stock for ${storeItem.item_name}. Available: ${qtyBefore}`);

      const qtyAfter = qtyBefore - qty;
      const unitPrice = item.unit_price ?? storeItem.selling_price;

      // Deduct
      await service
        .from('accom_store_items')
        .update({ quantity: qtyAfter, updated_at: new Date().toISOString() })
        .eq('id', storeItem.id);

      orderItems.push({
        name: storeItem.item_name,
        quantity: qty,
        unit_price: unitPrice,
        source: 'accom_store',
        accom_store_item_id: storeItem.id,
        ingredients: [],
        extras: [],
      });

      saleRecords.push({
        company_id: auth.companyId,
        branch_id: branchId,
        accom_store_item_id: storeItem.id,
        inventory_item_id: storeItem.inventory_item_id,
        quantity: qty,
        unit: storeItem.unit,
        sold_by: auth.userId,
        sold_by_name: auth.name,
      });

      movementRecords.push({
        company_id: auth.companyId,
        branch_id: branchId,
        accom_store_item_id: storeItem.id,
        inventory_item_id: storeItem.inventory_item_id,
        movement_type: 'sale',
        quantity_change: -qty,
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        reference_type: 'sale',
        notes: 'Accommodation order',
        performed_by: auth.userId,
        performed_by_name: auth.name,
      });
    } else if (item.source === 'room') {
      // Room booking item — capture full booking details
      const bd = item.booking_details ?? {};
      const numPeople = Number(bd.num_people ?? 1);
      const durationCount = Number(bd.duration_count ?? item.quantity ?? 1);
      const durationUnit = bd.duration_unit ?? 'night';
      const checkIn = bd.check_in ?? null;
      const checkOut = bd.check_out ?? null;

      orderItems.push({
        name: item.name,
        quantity: durationCount,
        unit_price: item.unit_price ?? 0,
        source: 'room',
        room_id: item.room_id,
        // Store booking metadata in ingredients field (mapped to order_items.modifiers)
        ingredients: [{
          type: 'booking',
          num_people: numPeople,
          duration_count: durationCount,
          duration_unit: durationUnit,
          check_in: checkIn,
          check_out: checkOut,
        }],
        extras: [],
      });

      // Load current room state, validate capacity, then update occupancy
      if (item.room_id) {
        const { data: currentRoom } = await service
          .from('rooms')
          .select('current_occupants, max_occupants')
          .eq('id', item.room_id)
          .eq('branch_id', branchId)
          .single();

        const prevOccupants = Number(currentRoom?.current_occupants ?? 0);
        const maxOccupants = Number(currentRoom?.max_occupants ?? 1);
        const newOccupants = prevOccupants + numPeople;

        if (newOccupants > maxOccupants) {
          return errorResponse(
            `Room capacity exceeded: adding ${numPeople} guest(s) would bring total to ${newOccupants}, ` +
            `but max occupants is ${maxOccupants} (currently ${prevOccupants} occupied).`
          );
        }

        await service
          .from('rooms')
          .update({
            status: calcRoomStatus(newOccupants, maxOccupants),
            current_occupants: newOccupants,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.room_id)
          .eq('branch_id', branchId);
      }
    } else {
      // Menu item (available meal)
      orderItems.push({
        name: item.name,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        menu_item_id: item.menu_item_id,
        source: 'menu',
        ingredients: item.ingredients ?? [],
        extras: item.extras ?? [],
      });
    }
  }

  // Calculate totals
  const subtotal = orderItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const discountAmount = body.discount_amount ?? 0;
  const total = Math.max(0, subtotal - discountAmount);

  // Create order
  const { data: order, error: orderErr } = await service
    .from('orders')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      order_type: body.order_type ?? 'dine_in',
      status: 'pending',
      table_id: body.table_id ?? null,
      linked_room_id: body.linked_room_id ?? null,
      linked_room_number: body.linked_room_number ?? null,
      customer_name: body.customer_name?.trim() || 'Walk In Customer',
      notes: body.notes ?? null,
      source: 'accommodation',
      department: 'accommodation',
      subtotal,
      total,
      discount_amount: discountAmount,
      discount_reason: body.discount_reason ?? null,
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select('id, order_number')
    .single();

  if (orderErr) return errorResponse(orderErr.message);

  // Insert order items
  const orderItemRows = orderItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id ?? '00000000-0000-0000-0000-000000000000',
    menu_item_name: it.name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    item_total: it.unit_price * it.quantity,
    station: 'accommodation' as const,
    status: 'pending' as const,
    modifiers: it.ingredients ?? [],
    selected_extras: it.extras ?? [],
  }));

  await service.from('order_items').insert(orderItemRows);

  // Insert accommodation store sale records
  if (saleRecords.length > 0) {
    const withOrderId = saleRecords.map((s) => ({ ...s, order_id: order.id }));
    await service.from('accom_store_sales').insert(withOrderId);
  }

  // Insert movement records
  if (movementRecords.length > 0) {
    const withRef = movementRecords.map((m) => ({ ...m, reference_id: order.id }));
    await service.from('accom_store_movements').insert(withRef);
  }

  // Create guest_bookings records for any room items (pending_checkin lifecycle)
  const roomItems = body.items.filter((i: any) => i.source === 'room');
  for (const roomItem of roomItems) {
    const bd = roomItem.booking_details ?? {};
    if (roomItem.room_id) {
      const { data: room } = await service
        .from('rooms')
        .select('room_number')
        .eq('id', roomItem.room_id)
        .single();

      await service.from('guest_bookings').insert({
        company_id: auth.companyId,
        branch_id: branchId,
        room_id: roomItem.room_id,
        room_number: room?.room_number ?? body.linked_room_number ?? '',
        order_id: order.id,
        order_number: order.order_number,
        customer_name: body.customer_name?.trim() || 'Walk In Customer',
        num_occupants: Number(bd.num_people ?? 1),
        scheduled_check_in: bd.check_in ?? null,
        scheduled_check_out: bd.check_out ?? null,
        duration_count: Number(bd.duration_count ?? 1),
        duration_unit: bd.duration_unit ?? 'night',
        status: 'pending_checkin',
      });
    }
  }

  return jsonResponse({
    order_id: order.id,
    order_number: order.order_number,
    total,
    items_count: orderItems.length,
  }, 201);
}

async function markServed(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.order_id) return errorResponse('Missing order_id');

  const service = createServiceClient();

  const { data, error } = await service
    .from('orders')
    .update({
      status: 'awaiting_payment',
      served_at: new Date().toISOString(),
    })
    .eq('id', body.order_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);

  await service.from('order_status_history').insert({
    order_id: body.order_id,
    old_status: 'pending',
    new_status: 'awaiting_payment',
    changed_by: auth.userId,
    changed_by_name: auth.name,
    notes: 'Accommodation — served, awaiting payment',
  });

  return jsonResponse({ order: data });
}

async function listAccomOrders(req: Request, supabase: any, auth: AuthContext, branchId: string, statuses: string[]) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const searchTerm = url.searchParams.get('search') ?? '';
  const dateRange = url.searchParams.get('date_range') ?? 'all';

  const service = createServiceClient();
  let query = service
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('department', 'accommodation')
    .in('status', statuses);

  if (searchTerm) {
    query = query.or(`order_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%`);
  }

  const now = new Date();
  if (dateRange === 'today') {
    query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
  } else if (dateRange === '7d') {
    query = query.gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());
  } else if (dateRange === '30d') {
    query = query.gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString());
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ orders: data ?? [], total: count ?? 0, page, pageSize });
}

async function getOrderDetail(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing order id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('orders')
    .select('*, order_items(*), order_payments(*), order_status_history(*)')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);

  // Enrich order items with ingredient & extra details from menu_items
  if (data?.order_items?.length) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const menuItemIds = [...new Set(
      data.order_items
        .filter((i: any) => i.menu_item_id && i.menu_item_id !== ZERO_UUID)
        .map((i: any) => i.menu_item_id)
    )];
    if (menuItemIds.length > 0) {
      const { data: menuItems } = await service
        .from('menu_items')
        .select('id, name, base_price, menu_item_ingredients(id, quantity_used, unit, inventory_items:ingredient_id(id, name, cost_per_unit)), menu_item_extras(id, name, price)')
        .in('id', menuItemIds);
      const menuMap = new Map((menuItems ?? []).map((m: any) => [m.id, m]));
      data.order_items = data.order_items.map((item: any) => {
        const mi: any = menuMap.get(item.menu_item_id);
        const ingredients = (mi?.menu_item_ingredients ?? []).map((ig: any) => ({
          name: ig.inventory_items?.name ?? 'Unknown',
          quantity_used: ig.quantity_used,
          unit: ig.unit,
          cost_contribution: ig.inventory_items?.cost_per_unit
            ? Number(ig.inventory_items.cost_per_unit) * Number(ig.quantity_used)
            : null,
        }));
        return {
          ...item,
          ingredients,
          extras_available: mi?.menu_item_extras ?? [],
        };
      });
    }
  }

  return jsonResponse({ order: data });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Accommodation Internal Store Operations
   ═══════════════════════════════════════════════════════════════════════════ */

async function listInternalSales(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const dateRange = url.searchParams.get('date_range') ?? 'today';

  let query = supabase
    .from('accom_store_sales')
    .select('*, accom_store_items(item_name, unit)', { count: 'exact' })
    .eq('branch_id', branchId);

  const now = new Date();
  if (dateRange === 'today') {
    query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
  } else if (dateRange === '7d') {
    query = query.gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());
  } else if (dateRange === '30d') {
    query = query.gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString());
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data ?? [], total: count ?? 0, page, pageSize });
}

async function listInternalMovements(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const dateRange = url.searchParams.get('date_range') ?? 'today';

  let query = supabase
    .from('accom_store_movements')
    .select('*, accom_store_items(item_name, unit)', { count: 'exact' })
    .eq('branch_id', branchId);

  const now = new Date();
  if (dateRange === 'today') {
    query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
  } else if (dateRange === '7d') {
    query = query.gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());
  } else if (dateRange === '30d') {
    query = query.gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString());
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ items: data ?? [], total: count ?? 0, page, pageSize });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Free Room (check-out guests, update occupancy)
   ═══════════════════════════════════════════════════════════════════════════ */

async function freeRoom(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.room_id) return errorResponse('Missing room_id');
  const peopleLeaving = Number(body.people_leaving);
  if (!peopleLeaving || peopleLeaving < 1) return errorResponse('people_leaving must be at least 1');

  const service = createServiceClient();
  const { data: room } = await service
    .from('rooms')
    .select('id, current_occupants, max_occupants, room_number, status')
    .eq('id', body.room_id)
    .eq('branch_id', branchId)
    .single();

  if (!room) return errorResponse('Room not found', 404);

  const newOccupants = Math.max(0, Number(room.current_occupants) - peopleLeaving);
  const maxOccupants = Number(room.max_occupants ?? 1);

  const { data, error } = await service
    .from('rooms')
    .update({
      current_occupants: newOccupants,
      status: calcRoomStatus(newOccupants, maxOccupants),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.room_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ room: data });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Guest Lifecycle Management
   ═══════════════════════════════════════════════════════════════════════════ */

async function listPendingCheckins(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';

  const service = createServiceClient();
  let query = service
    .from('guest_bookings')
    .select('*, rooms(room_number, category, floor_section, max_occupants)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('status', 'pending_checkin');

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,room_number.ilike.%${search}%,order_number.ilike.%${search}%`);
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ bookings: data ?? [], total: count ?? 0, page, pageSize });
}

async function checkinGuest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');

  const service = createServiceClient();

  // Load the booking
  const { data: booking, error: bErr } = await service
    .from('guest_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'pending_checkin') return errorResponse(`Cannot check in — booking is already ${booking.status}`);

  const actualCheckIn = body.actual_check_in ?? new Date().toISOString();
  const numOccupants = Number(body.num_occupants ?? booking.num_occupants);

  // Update booking to checked_in
  const { data: updated, error: uErr } = await service
    .from('guest_bookings')
    .update({
      status: 'checked_in',
      actual_check_in: actualCheckIn,
      num_occupants: numOccupants,
      notes: body.notes ?? booking.notes,
      checked_in_by: auth.userId,
      checked_in_by_name: auth.name,
      checked_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .select()
    .single();
  if (uErr) return errorResponse(uErr.message);

  // Re-derive the room's actual occupancy after the check-in (staff may have changed num_occupants)
  const occupantsDiff = numOccupants - Number(booking.num_occupants);
  const { data: roomRow } = await service
    .from('rooms')
    .select('current_occupants, max_occupants')
    .eq('id', booking.room_id)
    .single();
  const newRoomOccupants = Math.max(0, Number(roomRow?.current_occupants ?? 0) + occupantsDiff);
  const maxOcc = Number(roomRow?.max_occupants ?? 1);

  await service
    .from('rooms')
    .update({
      current_occupants: newRoomOccupants,
      status: newRoomOccupants === 0 ? 'available' : calcRoomStatus(newRoomOccupants, maxOcc),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.room_id)
    .eq('branch_id', branchId);

  return jsonResponse({ booking: updated });
}

async function listInstay(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';

  const service = createServiceClient();
  let query = service
    .from('guest_bookings')
    .select('*, rooms(room_number, category, floor_section, max_occupants, cost_amount, cost_duration)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('status', 'checked_in');

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,room_number.ilike.%${search}%,order_number.ilike.%${search}%`);
  }

  query = applyPagination(query, page, pageSize, 'checked_in_at', false);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ bookings: data ?? [], total: count ?? 0, page, pageSize });
}

async function departGuest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');

  const service = createServiceClient();

  const { data: booking, error: bErr } = await service
    .from('guest_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'checked_in') return errorResponse(`Cannot depart — booking status is ${booking.status}`);

  const actualCheckOut = body.actual_check_out ?? new Date().toISOString();

  // Update booking to departed
  const { data: updated, error: uErr } = await service
    .from('guest_bookings')
    .update({
      status: 'departed',
      actual_check_out: actualCheckOut,
      departed_by: auth.userId,
      departed_by_name: auth.name,
      departed_at: new Date().toISOString(),
      notes: body.notes ?? booking.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .select()
    .single();
  if (uErr) return errorResponse(uErr.message);

  // Free the room — deduct this booking's occupants
  const { data: room } = await service
    .from('rooms')
    .select('current_occupants, max_occupants')
    .eq('id', booking.room_id)
    .single();

  const newOccupants = Math.max(0, Number(room?.current_occupants ?? 0) - Number(booking.num_occupants));
  const maxOcc = Number(room?.max_occupants ?? 1);
  await service
    .from('rooms')
    .update({
      current_occupants: newOccupants,
      status: calcRoomStatus(newOccupants, maxOcc),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.room_id)
    .eq('branch_id', branchId);

  return jsonResponse({ booking: updated });
}

async function transferGuest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');
  if (!body.new_room_id) return errorResponse('Missing new_room_id');

  const service = createServiceClient();

  const { data: booking, error: bErr } = await service
    .from('guest_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'checked_in') return errorResponse(`Can only transfer checked-in guests (current: ${booking.status})`);

  // Load new room
  const { data: newRoom, error: rErr } = await service
    .from('rooms')
    .select('id, room_number, status, current_occupants, max_occupants')
    .eq('id', body.new_room_id)
    .eq('branch_id', branchId)
    .single();
  if (rErr || !newRoom) return errorResponse('New room not found', 404);

  // Allow transfer to available OR partially_occupied rooms that have enough capacity
  if (newRoom.status !== 'available' && newRoom.status !== 'partially_occupied') {
    return errorResponse(`Room ${newRoom.room_number} is not available for transfer (status: ${newRoom.status})`);
  }
  const newRoomAvailableSlots = Number(newRoom.max_occupants) - Number(newRoom.current_occupants);
  if (Number(booking.num_occupants) > newRoomAvailableSlots) {
    return errorResponse(
      `Room ${newRoom.room_number} cannot fit ${booking.num_occupants} guest(s). ` +
      `Available capacity: ${newRoomAvailableSlots} (max ${newRoom.max_occupants}, current ${newRoom.current_occupants}).`
    );
  }

  // Free old room — deduct this booking's occupants
  const { data: oldRoom } = await service
    .from('rooms')
    .select('current_occupants, max_occupants, room_number')
    .eq('id', booking.room_id)
    .single();

  const oldNewOccupants = Math.max(0, Number(oldRoom?.current_occupants ?? 0) - Number(booking.num_occupants));
  const oldMaxOcc = Number(oldRoom?.max_occupants ?? 1);
  await service.from('rooms').update({
    current_occupants: oldNewOccupants,
    status: calcRoomStatus(oldNewOccupants, oldMaxOcc),
    updated_at: new Date().toISOString(),
  }).eq('id', booking.room_id).eq('branch_id', branchId);

  // Occupy new room — additive (may already have other guests)
  const newRoomFinalOccupants = Number(newRoom.current_occupants) + Number(booking.num_occupants);
  await service.from('rooms').update({
    current_occupants: newRoomFinalOccupants,
    status: calcRoomStatus(newRoomFinalOccupants, Number(newRoom.max_occupants)),
    updated_at: new Date().toISOString(),
  }).eq('id', body.new_room_id).eq('branch_id', branchId);

  // Build new transfer history entry
  const historyEntry = {
    from_room_id: booking.room_id,
    from_room_number: oldRoom?.room_number ?? booking.room_number,
    to_room_id: newRoom.id,
    to_room_number: newRoom.room_number,
    transferred_by_name: auth.name,
    at: new Date().toISOString(),
    notes: body.notes ?? null,
  };
  const updatedHistory = [...(booking.transfer_history ?? []), historyEntry];

  // Update booking
  const { data: updated, error: uErr } = await service
    .from('guest_bookings')
    .update({
      room_id: newRoom.id,
      room_number: newRoom.room_number,
      transfer_history: updatedHistory,
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

async function extendStay(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.booking_id) return errorResponse('Missing booking_id');
  if (!body.duration_count || Number(body.duration_count) < 1) return errorResponse('duration_count must be at least 1');

  const service = createServiceClient();

  // Load current booking
  const { data: booking, error: bErr } = await service
    .from('guest_bookings')
    .select('*')
    .eq('id', body.booking_id)
    .eq('branch_id', branchId)
    .single();
  if (bErr || !booking) return errorResponse('Booking not found', 404);
  if (booking.status !== 'checked_in') return errorResponse(`Can only extend checked-in guests`);

  // Load room for cost info
  const { data: room } = await service
    .from('rooms')
    .select('id, room_number, cost_amount, cost_duration')
    .eq('id', booking.room_id)
    .single();
  if (!room) return errorResponse('Room not found', 404);

  const durationCount = Number(body.duration_count);
  const durationUnit = body.duration_unit ?? room.cost_duration ?? 'night';
  const unitPrice = Number(room.cost_amount);
  const total = unitPrice * durationCount;

  // Create a new extension order (pending → awaiting_payment; no stock changes for room)
  const { data: order, error: oErr } = await service
    .from('orders')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      order_type: 'dine_in',
      status: 'awaiting_payment',
      linked_room_id: room.id,
      linked_room_number: room.room_number,
      customer_name: booking.customer_name ?? 'Walk In Customer',
      notes: body.notes ?? `Extension from booking ${booking.order_number}`,
      source: 'accommodation',
      department: 'accommodation',
      subtotal: total,
      total,
      discount_amount: 0,
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select('id, order_number')
    .single();
  if (oErr) return errorResponse(oErr.message);

  // Create the extension order item
  await service.from('order_items').insert({
    order_id: order.id,
    menu_item_id: '00000000-0000-0000-0000-000000000000',
    menu_item_name: `Room ${room.room_number} — Extension`,
    quantity: durationCount,
    unit_price: unitPrice,
    item_total: total,
    station: 'accommodation',
    status: 'pending',
    modifiers: [{
      type: 'booking',
      num_people: booking.num_occupants,
      duration_count: durationCount,
      duration_unit: durationUnit,
      check_in: body.new_check_in ?? null,
      check_out: body.new_check_out ?? null,
      extension_of: booking.order_number,
    }],
    selected_extras: [],
  });

  // Update scheduled_check_out on the current booking if provided
  if (body.new_check_out) {
    await service.from('guest_bookings')
      .update({ scheduled_check_out: body.new_check_out, updated_at: new Date().toISOString() })
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

async function listAccomStaff(req: Request, supabase: any, auth: AuthContext, branchId: string) {  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const { data: staff, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, branch_ids')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .contains('permissions', ['view_accommodation']);

  if (error) return errorResponse(error.message);

  const branchStaff = (staff ?? []).filter((s: any) => {
    const ids: string[] = s.branch_ids ?? [];
    return ids.includes(branchId);
  });

  return jsonResponse({
    staff: branchStaff.map((s: any) => ({
      id: s.id,
      name: s.name ?? s.email ?? 'Unknown',
      role: s.role ?? 'staff',
    })),
  });
}
