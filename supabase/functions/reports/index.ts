import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient, requireAuth, hasPermission, resolveBranchId, resolveBranchIdOrAll,
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

    if (!hasPermission(auth, 'view_reports')) return errorResponse('Forbidden', 403);

    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    // These two new endpoints support "all branches" for global staff
    if (action === 'financial-dashboard') {
      const branchId = resolveBranchIdOrAll(auth, req);
      return await getFinancialDashboard(auth, branchId, url.searchParams);
    }
    if (action === 'transaction-list') {
      const branchId = resolveBranchIdOrAll(auth, req);
      return await getTransactionList(auth, branchId, url.searchParams);
    }

    // Existing endpoints require a specific branch
    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    switch (action) {
      case 'dashboard':
        return await getDashboard(supabase, auth, branchId);
      case 'daily-sales':
        return await getDailySales(supabase, branchId, dateFrom, dateTo);
      case 'payment-breakdown':
        return await getPaymentBreakdown(supabase, branchId, dateFrom, dateTo);
      case 'menu-performance':
        return await getMenuPerformance(supabase, branchId, dateFrom, dateTo);
      case 'inventory-usage':
        return await getInventoryUsage(supabase, branchId);
      case 'wastage-trends':
        return await getWastageTrends(supabase, branchId, dateFrom, dateTo);
      case 'rider-performance':
        return await getRiderPerformance(supabase, branchId, dateFrom, dateTo);
      case 'loyalty-usage':
        return await getLoyaltyUsage(supabase, auth.companyId!, dateFrom, dateTo);
      case 'shift-summary':
        return await getShiftSummary(supabase, branchId, dateFrom, dateTo);
      case 'branch-comparison':
        return await getBranchComparison(supabase, auth.companyId!, dateFrom, dateTo);
      default:
        return errorResponse('Unknown report', 404);
    }
  } catch (err) {
    console.error('Reports error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function getDashboard(supabase: any, auth: AuthContext, branchId: string) {
  const today = new Date().toISOString().split('T')[0];

  // Today's orders
  const { data: todayOrders, count: totalOrders } = await supabase
    .from('orders')
    .select('total, status', { count: 'exact' })
    .eq('branch_id', branchId)
    .gte('created_at', today + 'T00:00:00')
    .not('status', 'in', '("cancelled","refunded")');

  const todaySales = (todayOrders ?? []).reduce((sum: number, o: any) => sum + Number(o.total), 0);

  // Active orders
  const { count: activeOrders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .in('status', ['pending', 'confirmed', 'preparing', 'ready']);

  // Low stock count
  const { data: inventory } = await supabase
    .from('inventory_items')
    .select('quantity, min_quantity')
    .eq('branch_id', branchId)
    .eq('is_active', true);

  const lowStockCount = (inventory ?? []).filter((i: any) => i.quantity <= i.min_quantity).length;

  // Active deliveries
  const { count: activeDeliveries } = await supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .in('status', ['assigned', 'picked_up', 'in_transit']);

  // Current shift
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, opened_by_name, opening_cash, created_at')
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .maybeSingle();

  return jsonResponse({
    today_sales: todaySales,
    today_orders: totalOrders ?? 0,
    active_orders: activeOrders ?? 0,
    low_stock_count: lowStockCount,
    active_deliveries: activeDeliveries ?? 0,
    current_shift: shift,
  });
}

async function getDailySales(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_daily_sales').select('*').eq('branch_id', branchId);
  if (dateFrom) query = query.gte('sale_date', dateFrom);
  if (dateTo) query = query.lte('sale_date', dateTo);
  query = query.order('sale_date', { ascending: false }).limit(90);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getPaymentBreakdown(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_payment_breakdown').select('*').eq('branch_id', branchId);
  if (dateFrom) query = query.gte('payment_date', dateFrom);
  if (dateTo) query = query.lte('payment_date', dateTo);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getMenuPerformance(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  // Use orders + order_items since the view might not filter by date range well
  let query = supabase
    .from('order_items')
    .select('menu_item_id, menu_item_name, quantity, item_total, orders!inner(branch_id, created_at, status)')
    .eq('orders.branch_id', branchId)
    .not('orders.status', 'in', '("cancelled","refunded")');

  if (dateFrom) query = query.gte('orders.created_at', dateFrom);
  if (dateTo) query = query.lte('orders.created_at', dateTo);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  // Aggregate in app
  const map = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of data ?? []) {
    const existing = map.get(item.menu_item_id) ?? { name: item.menu_item_name, quantity: 0, revenue: 0 };
    existing.quantity += item.quantity;
    existing.revenue += Number(item.item_total);
    map.set(item.menu_item_id, existing);
  }

  const report = Array.from(map.entries()).map(([id, stats]) => ({
    menu_item_id: id,
    ...stats,
  })).sort((a, b) => b.revenue - a.revenue);

  return jsonResponse({ report });
}

async function getInventoryUsage(supabase: any, branchId: string) {
  const { data, error } = await supabase
    .from('mv_inventory_usage')
    .select('*')
    .eq('branch_id', branchId)
    .order('total_deducted', { ascending: false });

  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getWastageTrends(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase
    .from('wastage_records')
    .select('inventory_item_name, wastage_type, quantity, unit_cost, total_value, created_at')
    .eq('branch_id', branchId);

  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  query = query.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  const totalValue = (data ?? []).reduce((sum: number, r: any) => sum + Number(r.total_value), 0);

  return jsonResponse({ report: data, total_wastage_value: totalValue });
}

async function getRiderPerformance(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_rider_performance').select('*').eq('branch_id', branchId);
  if (dateFrom) query = query.gte('delivery_date', dateFrom);
  if (dateTo) query = query.lte('delivery_date', dateTo);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getLoyaltyUsage(supabase: any, companyId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_loyalty_usage').select('*').eq('company_id', companyId);
  if (dateFrom) query = query.gte('transaction_date', dateFrom);
  if (dateTo) query = query.lte('transaction_date', dateTo);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getShiftSummary(supabase: any, branchId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_shift_summary').select('*').eq('branch_id', branchId);
  if (dateFrom) query = query.gte('opened_at', dateFrom);
  if (dateTo) query = query.lte('opened_at', dateTo);
  query = query.order('opened_at', { ascending: false }).limit(50);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

async function getBranchComparison(supabase: any, companyId: string, dateFrom: string | null, dateTo: string | null) {
  let query = supabase.from('v_branch_comparison').select('*').eq('company_id', companyId);
  if (dateFrom) query = query.gte('sale_date', dateFrom);
  if (dateTo) query = query.lte('sale_date', dateTo);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return jsonResponse({ report: data });
}

// ══════════════════════════════════════════════════════════════════════════════
// Financial Dashboard
// ══════════════════════════════════════════════════════════════════════════════

/** Helper: apply branch filter — supports '__all__' sentinel for company-wide data */
function branchFilter(query: any, branchId: string, column = 'branch_id') {
  return branchId === '__all__' ? query : query.eq(column, branchId);
}

async function getFinancialDashboard(auth: AuthContext, branchId: string, params: URLSearchParams) {
  const service = createServiceClient();
  const companyId = auth.companyId!;
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const paymentMethodsRaw = params.get('payment_methods');
  const paymentMethods = paymentMethodsRaw ? paymentMethodsRaw.split(',').filter(Boolean) : null;
  const stockView = params.get('stock_view') ?? 'all';

  // Build date-bounded end-of-day timestamp
  const dateToTs = dateTo ? dateTo + 'T23:59:59.999Z' : null;
  const dateFromTs = dateFrom ? dateFrom + 'T00:00:00.000Z' : null;

  // ── 1) Total Revenue ────────────────────────────────────────────────────
  // Revenue = sum of order totals for qualifying orders:
  //   - Online source: meal orders in active statuses (pending→delivered),
  //     plus all other online orders with completed status
  //   - Internal sources (pos, bar, kitchen, etc.): only completed orders
  // Each order counted once via unique order IDs.
  // Uses order totals directly (some online orders lack payment records).
  const revenuePromise = (async () => {
    const onlineSources = ['online'];
    const internalSources = ['pos', 'phone', 'kitchen', 'bar', 'accommodation', 'other_services'];
    const onlineActiveStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];

    // Fetch online orders in active/completed status
    let oqOnline = service
      .from('orders')
      .select('id, total')
      .eq('company_id', companyId)
      .in('source', onlineSources)
      .in('status', onlineActiveStatuses);
    oqOnline = branchFilter(oqOnline, branchId);
    if (dateFromTs) oqOnline = oqOnline.gte('created_at', dateFromTs);
    if (dateToTs) oqOnline = oqOnline.lte('created_at', dateToTs);

    // Fetch internal orders with completed status only
    let oqInternal = service
      .from('orders')
      .select('id, total')
      .eq('company_id', companyId)
      .in('source', internalSources)
      .eq('status', 'completed');
    oqInternal = branchFilter(oqInternal, branchId);
    if (dateFromTs) oqInternal = oqInternal.gte('created_at', dateFromTs);
    if (dateToTs) oqInternal = oqInternal.lte('created_at', dateToTs);

    const [{ data: onlineOrders }, { data: internalOrders }] = await Promise.all([
      oqOnline, oqInternal,
    ]);

    // Unique order IDs to avoid double-counting — use order totals directly
    const orderMap = new Map<string, number>();
    for (const o of (onlineOrders ?? []) as any[]) orderMap.set(o.id, Number(o.total));
    for (const o of (internalOrders ?? []) as any[]) orderMap.set(o.id, Number(o.total));
    if (orderMap.size === 0) return 0;

    // If payment methods filter is active, restrict to orders with matching paid payments
    if (paymentMethods) {
      const orderIds = [...orderMap.keys()];
      const matchingIds = new Set<string>();
      for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        const { data: payments } = await service
          .from('order_payments')
          .select('order_id')
          .eq('status', 'paid')
          .in('order_id', chunk)
          .in('payment_method', paymentMethods);
        for (const p of (payments ?? []) as any[]) matchingIds.add(p.order_id);
      }
      for (const id of orderIds) {
        if (!matchingIds.has(id)) orderMap.delete(id);
      }
    }

    const total = [...orderMap.values()].reduce((s, v) => s + v, 0);
    return Math.round(total * 100) / 100;
  })();

  // ── 2) Revenue Pending (orders awaiting payment) ───────────────────────
  // Pending revenue = sum of order totals for:
  //   - Internal sources: orders with 'awaiting_payment' or 'pending' status
  //   - Online source: orders with 'awaiting_payment' status only
  // Each order counted once via unique order IDs.
  const pendingPromise = (async () => {
    const internalSources = ['pos', 'phone', 'kitchen', 'bar', 'accommodation', 'other_services'];

    // Internal pending: awaiting_payment or pending
    let qInternal = service
      .from('orders')
      .select('id, total')
      .eq('company_id', companyId)
      .in('source', internalSources)
      .in('status', ['awaiting_payment', 'pending']);
    qInternal = branchFilter(qInternal, branchId);
    if (dateFromTs) qInternal = qInternal.gte('created_at', dateFromTs);
    if (dateToTs) qInternal = qInternal.lte('created_at', dateToTs);

    // Online pending: awaiting_payment only
    let qOnline = service
      .from('orders')
      .select('id, total')
      .eq('company_id', companyId)
      .in('source', ['online'])
      .eq('status', 'awaiting_payment');
    qOnline = branchFilter(qOnline, branchId);
    if (dateFromTs) qOnline = qOnline.gte('created_at', dateFromTs);
    if (dateToTs) qOnline = qOnline.lte('created_at', dateToTs);

    const [{ data: intOrders }, { data: onlOrders }] = await Promise.all([qInternal, qOnline]);

    // Unique orders (deduplicate by order id)
    const orderMap = new Map<string, number>();
    for (const o of (intOrders ?? []) as any[]) orderMap.set(o.id, Number(o.total));
    for (const o of (onlOrders ?? []) as any[]) orderMap.set(o.id, Number(o.total));

    const totalPending = [...orderMap.values()].reduce((s, v) => s + v, 0);
    return Math.round(Math.max(0, totalPending) * 100) / 100;
  })();

  // ── 3) COGS (sale_deductions + wastage from all sources + bar/accom store sales) ─
  const cogsPromise = (async () => {
    let totalCogs = 0;

    // 3a) Central inventory: stock_movements (sale_deduction + wastage)
    let smq = service
      .from('stock_movements')
      .select('quantity_change, unit_cost')
      .eq('company_id', companyId)
      .in('movement_type', ['sale_deduction', 'wastage']);
    smq = branchFilter(smq, branchId);
    if (dateFromTs) smq = smq.gte('created_at', dateFromTs);
    if (dateToTs) smq = smq.lte('created_at', dateToTs);
    const { data: smData } = await smq;
    totalCogs += (smData ?? []).reduce(
      (s: number, m: any) => s + Math.abs(Number(m.quantity_change)) * Number(m.unit_cost), 0,
    );

    // 3b) Bar store movements (sales)
    let bmq = service
      .from('bar_store_movements')
      .select('quantity_change, bar_store_items!inner(cost_per_unit)')
      .in('movement_type', ['sale']);
    bmq = branchFilter(bmq, branchId);
    if (dateFromTs) bmq = bmq.gte('created_at', dateFromTs);
    if (dateToTs) bmq = bmq.lte('created_at', dateToTs);
    const { data: bmData } = await bmq;
    totalCogs += (bmData ?? []).reduce(
      (s: number, m: any) => s + Math.abs(Number(m.quantity_change)) * Number(m.bar_store_items?.cost_per_unit ?? 0), 0,
    );

    // 3c) Accommodation store movements (sales)
    let amq = service
      .from('accom_store_movements')
      .select('quantity_change, accom_store_items!inner(cost_per_unit)')
      .in('movement_type', ['sale']);
    amq = branchFilter(amq, branchId);
    if (dateFromTs) amq = amq.gte('created_at', dateFromTs);
    if (dateToTs) amq = amq.lte('created_at', dateToTs);
    const { data: amData } = await amq;
    totalCogs += (amData ?? []).reduce(
      (s: number, m: any) => s + Math.abs(Number(m.quantity_change)) * Number(m.accom_store_items?.cost_per_unit ?? 0), 0,
    );

    // 3d) Wastage from internal stores + custom (not central — already counted in 3a)
    let wq = service
      .from('wastage_records')
      .select('total_value')
      .eq('company_id', companyId)
      .in('source', ['kitchen', 'bar', 'accommodation', 'custom']);
    wq = branchFilter(wq, branchId);
    if (dateFromTs) wq = wq.gte('created_at', dateFromTs);
    if (dateToTs) wq = wq.lte('created_at', dateToTs);
    const { data: wData } = await wq;
    totalCogs += (wData ?? []).reduce(
      (s: number, r: any) => s + Number(r.total_value ?? 0), 0,
    );

    return Math.round(totalCogs * 100) / 100;
  })();

  // ── 4) Stock Value (current snapshot, not date-filtered) ───────────────
  // For each item: use selling_price if > 0, otherwise cost_per_unit.
  // Never add both — it's one or the other per item.
  // For internal stores, fall back to parent inventory_items prices when
  // the store item has no selling_price or cost_per_unit.
  const stockPromise = (async () => {
    const calcValue = (rows: any[], useParentFallback = false) =>
      (rows ?? []).reduce((s: number, r: any) => {
        let sp = Number(r.selling_price ?? 0);
        let cp = Number(r.cost_per_unit ?? 0);
        const qty = Number(r.quantity ?? 0);
        if (qty <= 0) return s;
        // Fall back to parent inventory item prices if store item has none
        if (useParentFallback && sp <= 0 && cp <= 0 && r.inventory_items) {
          sp = Number(r.inventory_items.selling_price ?? 0);
          cp = Number(r.inventory_items.cost_per_unit ?? 0);
        }
        const unitVal = sp > 0 ? sp : cp;
        return s + unitVal * qty;
      }, 0);

    const result: Record<string, number> = { central: 0, kitchen: 0, bar: 0, accommodation: 0 };
    const promises: Promise<void>[] = [];

    if (stockView === 'all' || stockView === 'central') {
      promises.push((async () => {
        let q = service.from('inventory_items').select('cost_per_unit, selling_price, quantity').eq('company_id', companyId).eq('is_active', true).gt('quantity', 0);
        q = branchFilter(q, branchId);
        const { data, error } = await q;
        if (error) console.error('Stock central error:', error.message);
        result.central = Math.round(calcValue(data ?? []) * 100) / 100;
      })());
    }
    if (stockView === 'all' || stockView === 'kitchen') {
      promises.push((async () => {
        let q = service.from('kitchen_store_items').select('cost_per_unit, selling_price, quantity, inventory_items(selling_price, cost_per_unit)').eq('company_id', companyId).gt('quantity', 0);
        q = branchFilter(q, branchId);
        const { data, error } = await q;
        if (error) console.error('Stock kitchen error:', error.message);
        result.kitchen = Math.round(calcValue(data ?? [], true) * 100) / 100;
      })());
    }
    if (stockView === 'all' || stockView === 'bar') {
      promises.push((async () => {
        let q = service.from('bar_store_items').select('cost_per_unit, selling_price, quantity, inventory_items(selling_price, cost_per_unit)').eq('company_id', companyId).gt('quantity', 0);
        q = branchFilter(q, branchId);
        const { data, error } = await q;
        if (error) console.error('Stock bar error:', error.message);
        result.bar = Math.round(calcValue(data ?? [], true) * 100) / 100;
      })());
    }
    if (stockView === 'all' || stockView === 'accommodation') {
      promises.push((async () => {
        let q = service.from('accom_store_items').select('selling_price, quantity, inventory_items(selling_price, cost_per_unit)').eq('company_id', companyId).gt('quantity', 0);
        q = branchFilter(q, branchId);
        const { data, error } = await q;
        if (error) console.error('Stock accommodation error:', error.message);
        result.accommodation = Math.round(calcValue(data ?? [], true) * 100) / 100;
      })());
    }

    await Promise.all(promises);
    const total = Math.round((result.central + result.kitchen + result.bar + result.accommodation) * 100) / 100;
    return { ...result, total };
  })();

  // ── 5) Average Transaction ─────────────────────────────────────────────
  const avgPromise = (async () => {
    let oq = service
      .from('orders')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'completed');
    oq = branchFilter(oq, branchId);
    if (dateFromTs) oq = oq.gte('created_at', dateFromTs);
    if (dateToTs) oq = oq.lte('created_at', dateToTs);
    const { data: orders } = await oq;
    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) return 0;

    let totalAmount = 0;
    let count = 0;
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500);
      let pq = service
        .from('order_payments')
        .select('amount')
        .eq('status', 'paid')
        .in('order_id', chunk);
      if (paymentMethods) pq = pq.in('payment_method', paymentMethods);
      const { data: payments } = await pq;
      for (const p of payments ?? []) { totalAmount += Number(p.amount); count++; }
    }
    return count > 0 ? Math.round((totalAmount / count) * 100) / 100 : 0;
  })();

  // ── 6) Staffing Cost (paid payroll) ────────────────────────────────────
  const staffingPromise = (async () => {
    let q = service
      .from('payroll_records')
      .select('net_pay')
      .eq('company_id', companyId)
      .eq('status', 'paid');
    if (branchId !== '__all__') q = q.eq('branch_id', branchId);
    if (dateFrom) q = q.gte('period_start', dateFrom);
    if (dateTo) q = q.lte('period_end', dateTo);
    const { data } = await q;
    const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.net_pay), 0);
    return Math.round(total * 100) / 100;
  })();

  // Run all in parallel
  const [revenue, pending, cogs, stock, avgTransaction, staffingCost] = await Promise.all([
    revenuePromise, pendingPromise, cogsPromise, stockPromise, avgPromise, staffingPromise,
  ]);

  const netPosition = Math.round((revenue - cogs - staffingCost) * 100) / 100;

  return jsonResponse({
    total_revenue: revenue,
    revenue_pending: pending,
    cogs,
    stock_value: stock,
    avg_transaction: avgTransaction,
    staffing_cost: staffingCost,
    net_position: netPosition,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Transaction List (paginated)
// ══════════════════════════════════════════════════════════════════════════════

async function getTransactionList(auth: AuthContext, branchId: string, params: URLSearchParams) {
  const service = createServiceClient();
  const companyId = auth.companyId!;

  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('page_size') ?? '20', 10)));
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const dateToTs = dateTo ? dateTo + 'T23:59:59.999Z' : null;
  const dateFromTs = dateFrom ? dateFrom + 'T00:00:00.000Z' : null;
  const paymentMethodsRaw = params.get('payment_methods');
  const paymentMethods = paymentMethodsRaw ? paymentMethodsRaw.split(',').filter(Boolean) : null;
  const stationsRaw = params.get('stations');
  const stations = stationsRaw ? stationsRaw.split(',').filter(Boolean) : null;
  const search = params.get('search')?.trim();
  const sortColumn = params.get('sort_column') ?? 'created_at';
  const sortDirection = (params.get('sort_direction') ?? 'DESC').toUpperCase();
  const ascending = sortDirection === 'ASC';

  // ── Pre-filter: if payment_methods or stations specified, find qualifying order IDs ──
  let preFilterIds: string[] | null = null;

  if (paymentMethods && paymentMethods.length > 0) {
    const { data } = await service
      .from('order_payments')
      .select('order_id')
      .eq('status', 'paid')
      .in('payment_method', paymentMethods);
    preFilterIds = [...new Set((data ?? []).map((d: any) => d.order_id))];
    if (preFilterIds.length === 0) return jsonResponse({ items: [], total: 0, page, page_size: pageSize });
  }

  if (stations && stations.length > 0) {
    const { data } = await service
      .from('order_items')
      .select('order_id')
      .in('station', stations);
    const stationIds = new Set((data ?? []).map((d: any) => d.order_id));
    if (preFilterIds) {
      preFilterIds = preFilterIds.filter((id) => stationIds.has(id));
    } else {
      preFilterIds = [...stationIds];
    }
    if (preFilterIds.length === 0) return jsonResponse({ items: [], total: 0, page, page_size: pageSize });
  }

  // ── Main orders query ──────────────────────────────────────────────────
  let q = service
    .from('orders')
    .select('id, created_at, branch_id, source, total, status, created_by_name, order_number, branches!inner(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .not('status', 'in', '("cancelled","refunded")');

  q = branchFilter(q, branchId);
  if (dateFromTs) q = q.gte('created_at', dateFromTs);
  if (dateToTs) q = q.lte('created_at', dateToTs);
  if (search) q = q.or(`order_number.ilike.%${search}%,created_by_name.ilike.%${search}%`);
  if (preFilterIds) {
    // Paginate within pre-filtered IDs — cap to avoid oversized IN
    q = q.in('id', preFilterIds.slice(0, 2000));
  }

  const allowedSortCols = ['created_at', 'total', 'order_number', 'status'];
  const col = allowedSortCols.includes(sortColumn) ? sortColumn : 'created_at';
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  q = q.order(col, { ascending }).range(from, to);

  const { data: orders, count, error } = await q;
  if (error) return errorResponse(error.message);
  if (!orders || orders.length === 0) return jsonResponse({ items: [], total: count ?? 0, page, page_size: pageSize });

  const orderIds = orders.map((o: any) => o.id);

  // ── Batch-fetch related data for this page ─────────────────────────────
  const [itemsRes, paymentsRes, cogsRes] = await Promise.all([
    service.from('order_items').select('order_id, menu_item_name, quantity, station').in('order_id', orderIds),
    service.from('order_payments').select('order_id, payment_method, status, amount').eq('status', 'paid').in('order_id', orderIds),
    service.from('stock_movements').select('reference_id, quantity_change, unit_cost').eq('reference_type', 'order').in('reference_id', orderIds),
  ]);

  // Build lookup maps
  const itemsByOrder = new Map<string, { names: string[]; stations: Set<string> }>();
  for (const it of itemsRes.data ?? []) {
    let entry = itemsByOrder.get(it.order_id);
    if (!entry) { entry = { names: [], stations: new Set() }; itemsByOrder.set(it.order_id, entry); }
    entry.names.push(`${it.menu_item_name} ×${it.quantity}`);
    if (it.station) entry.stations.add(it.station);
  }

  const paymentsByOrder = new Map<string, { methods: Set<string>; status: string }>();
  for (const p of paymentsRes.data ?? []) {
    let entry = paymentsByOrder.get(p.order_id);
    if (!entry) { entry = { methods: new Set(), status: p.status }; paymentsByOrder.set(p.order_id, entry); }
    entry.methods.add(p.payment_method);
  }

  const cogsByOrder = new Map<string, number>();
  for (const m of cogsRes.data ?? []) {
    const prev = cogsByOrder.get(m.reference_id) ?? 0;
    cogsByOrder.set(m.reference_id, prev + Math.abs(Number(m.quantity_change)) * Number(m.unit_cost));
  }

  // ── Assemble response rows ─────────────────────────────────────────────
  const items = orders.map((o: any) => {
    const orderItems = itemsByOrder.get(o.id);
    const orderPayments = paymentsByOrder.get(o.id);
    const orderCogs = cogsByOrder.get(o.id) ?? 0;

    return {
      id: o.id,
      date: o.created_at,
      branch_name: o.branches?.name ?? '—',
      station: orderItems ? [...orderItems.stations].join(', ') : '—',
      cashier_name: o.created_by_name ?? '—',
      source: o.source,
      items: orderItems ? orderItems.names.join(', ') : '—',
      payment_method: orderPayments ? [...orderPayments.methods].join(', ') : '—',
      payment_status: orderPayments ? 'paid' : 'unpaid',
      order_status: o.status,
      total: Number(o.total),
      cogs: Math.round(orderCogs * 100) / 100,
    };
  });

  return jsonResponse({ items, total: count ?? 0, page, page_size: pageSize });
}
