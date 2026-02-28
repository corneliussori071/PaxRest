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

    const canBar = (perm: string) =>
      hasPermission(auth, perm) || hasPermission(auth, 'view_bar') || hasPermission(auth, 'manage_menu');

    switch (action) {
      // ─── Bar Internal Store ───
      case 'internal-store':
        return await listInternalStore(req, supabase, auth, branchId);
      case 'internal-store-update-price':
        return await updateStoreItemPrice(req, supabase, auth, branchId);
      case 'internal-store-movements':
        return await listInternalMovements(req, supabase, auth, branchId);
      case 'internal-store-sales':
        return await listInternalSales(req, supabase, auth, branchId);
      case 'internal-store-staff':
        return await listBarStaff(req, supabase, auth, branchId);

      // ─── Bar Orders ───
      case 'create-order':
        return await createBarOrder(req, supabase, auth, branchId);
      case 'pending-orders':
        return await listBarOrders(req, supabase, auth, branchId, ['pending', 'confirmed', 'preparing', 'ready']);
      case 'mark-served':
        return await markServed(req, supabase, auth, branchId);
      case 'awaiting-payment':
        return await listBarOrders(req, supabase, auth, branchId, ['awaiting_payment']);
      case 'order-detail':
        return await getOrderDetail(req, supabase, auth, branchId);

      // ─── Bar barcode lookup ───
      case 'barcode-lookup':
        return await barcodeLookup(req, supabase, auth, branchId);

      default:
        return errorResponse('Unknown bar action', 404);
    }
  } catch (err) {
    console.error('Bar error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   Bar Internal Store — isolated stock tracking, auto-stocked from received
   ingredient requests. Bar sells items (mostly drinks) from here.
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
    .from('bar_store_items')
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
  if (!body.bar_store_item_id) return errorResponse('Missing bar_store_item_id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.selling_price !== undefined) updates.selling_price = body.selling_price;
  if (body.barcode !== undefined) updates.barcode = body.barcode;

  const service = createServiceClient();
  const { data, error } = await service
    .from('bar_store_items')
    .update(updates)
    .eq('id', body.bar_store_item_id)
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
    .from('bar_store_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('barcode', barcode)
    .gt('quantity', 0)
    .single();

  if (error) return jsonResponse({ item: null });
  return jsonResponse({ item: data });
}

/* ─── Bar Orders ─── */

async function createBarOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json();
  if (!body.items || body.items.length === 0) return errorResponse('No items in order');
  if (!body.table_id) return errorResponse('Table selection is required');
  if (!body.num_people || body.num_people < 1) return errorResponse('Number of people is required');

  const service = createServiceClient();

  // Validate bar stock + deduct
  const orderItems: any[] = [];
  const saleRecords: any[] = [];
  const movementRecords: any[] = [];

  for (const item of body.items) {
    if (item.source === 'bar_store') {
      // Bar internal store item
      const { data: storeItem, error: sErr } = await service
        .from('bar_store_items')
        .select('id, quantity, selling_price, item_name, unit, inventory_item_id')
        .eq('id', item.bar_store_item_id)
        .eq('branch_id', branchId)
        .single();
      if (sErr || !storeItem) return errorResponse(`Bar item not found: ${item.name ?? item.bar_store_item_id}`);

      const qty = Number(item.quantity);
      const qtyBefore = Number(storeItem.quantity);
      if (qty > qtyBefore) return errorResponse(`Insufficient stock for ${storeItem.item_name}. Available: ${qtyBefore}`);

      const qtyAfter = qtyBefore - qty;
      const unitPrice = item.unit_price ?? storeItem.selling_price;

      // Deduct
      await service
        .from('bar_store_items')
        .update({ quantity: qtyAfter, updated_at: new Date().toISOString() })
        .eq('id', storeItem.id);

      orderItems.push({
        name: storeItem.item_name,
        quantity: qty,
        unit_price: unitPrice,
        source: 'bar_store',
        bar_store_item_id: storeItem.id,
        ingredients: [],
        extras: [],
      });

      saleRecords.push({
        company_id: auth.companyId,
        branch_id: branchId,
        bar_store_item_id: storeItem.id,
        inventory_item_id: storeItem.inventory_item_id,
        quantity: qty,
        unit: storeItem.unit,
        sold_by: auth.userId,
        sold_by_name: auth.name,
      });

      movementRecords.push({
        company_id: auth.companyId,
        branch_id: branchId,
        bar_store_item_id: storeItem.id,
        inventory_item_id: storeItem.inventory_item_id,
        movement_type: 'sale',
        quantity_change: -qty,
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        reference_type: 'sale',
        notes: `Bar order`,
        performed_by: auth.userId,
        performed_by_name: auth.name,
      });
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
      table_id: body.table_id,
      customer_name: body.customer_name?.trim() || 'Walk In Customer',
      notes: body.notes ?? null,
      source: 'bar',
      department: 'bar',
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

  // Insert order items — store ingredients in modifiers and extras in selected_extras
  const orderItemRows = orderItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id ?? '00000000-0000-0000-0000-000000000000',
    menu_item_name: it.name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    item_total: it.unit_price * it.quantity,
    station: 'bar' as const,
    status: 'pending' as const,
    modifiers: JSON.stringify(it.ingredients ?? []),
    selected_extras: JSON.stringify(it.extras ?? []),
  }));

  await service.from('order_items').insert(orderItemRows);

  // Insert bar store sale records with order_id
  if (saleRecords.length > 0) {
    const withOrderId = saleRecords.map((s) => ({ ...s, order_id: order.id }));
    await service.from('bar_store_sales').insert(withOrderId);
  }

  // Insert movement records with order ref
  if (movementRecords.length > 0) {
    const withRef = movementRecords.map((m) => ({ ...m, reference_id: order.id }));
    await service.from('bar_store_movements').insert(withRef);
  }

  // Update table to occupied with num_people
  await service
    .from('tables')
    .update({
      status: 'occupied',
      num_people: body.num_people,
      assigned_customer_name: body.customer_name ?? null,
      current_order_id: order.id,
    })
    .eq('id', body.table_id)
    .eq('branch_id', branchId);

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

  // Update order to awaiting_payment
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

  // Log status change
  await service.from('order_status_history').insert({
    order_id: body.order_id,
    old_status: 'pending',
    new_status: 'awaiting_payment',
    changed_by: auth.userId,
    changed_by_name: auth.name,
    notes: 'Table served — awaiting payment',
  });

  return jsonResponse({ order: data });
}

async function listBarOrders(req: Request, supabase: any, auth: AuthContext, branchId: string, statuses: string[]) {
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
    .eq('department', 'bar')
    .in('status', statuses);

  // Search by order_number or customer_name
  if (searchTerm) {
    query = query.or(`order_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%`);
  }

  // Date range filtering
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
        // Flatten ingredient data for frontend rendering
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
   Bar Internal Store Operations
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
    .from('bar_store_sales')
    .select('*, bar_store_items(item_name, unit)', { count: 'exact' })
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
    .from('bar_store_movements')
    .select('*, bar_store_items(item_name, unit)', { count: 'exact' })
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

async function listBarStaff(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const { data: staff, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, branch_ids')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .contains('permissions', ['view_bar']);

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
