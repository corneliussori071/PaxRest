import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;

    if (!hasPermission(auth, 'manage_reports')) return errorResponse('Forbidden', 403);

    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

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
