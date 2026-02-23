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
      case 'create':
        return await createOrder(req, supabase, auth, branchId);
      case 'list':
        return await listOrders(req, supabase, auth, branchId);
      case 'get':
        return await getOrder(req, supabase, auth, branchId);
      case 'update-status':
        return await updateOrderStatus(req, supabase, auth);
      case 'add-payment':
        return await addPayment(req, supabase, auth);
      case 'void':
        return await voidOrder(req, supabase, auth);
      default:
        return errorResponse('Unknown orders action', 404);
    }
  } catch (err) {
    console.error('Orders error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── Create Order (calls DB function for atomic deduction) ──────────────────

async function createOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_orders')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.order_type || !body.items || body.items.length === 0) {
    return errorResponse('Missing order_type or items');
  }

  // Call the atomic DB function
  const { data, error } = await supabase.rpc('create_order_with_deduction', {
    p_company_id: auth.companyId,
    p_branch_id: branchId,
    p_order_type: body.order_type,
    p_table_id: body.table_id ?? null,
    p_customer_id: body.customer_id ?? null,
    p_customer_name: body.customer_name ?? null,
    p_customer_phone: body.customer_phone ?? null,
    p_customer_email: body.customer_email ?? null,
    p_customer_address: body.customer_address ?? null,
    p_notes: body.notes ?? null,
    p_source: body.source ?? 'pos',
    p_shift_id: body.shift_id ?? null,
    p_created_by: auth.userId,
    p_created_by_name: body.created_by_name ?? auth.email,
    p_tax_rate: body.tax_rate ?? 0,
    p_discount_amount: body.discount_amount ?? 0,
    p_discount_reason: body.discount_reason ?? null,
    p_tip_amount: body.tip_amount ?? 0,
    p_delivery_fee: body.delivery_fee ?? 0,
    p_loyalty_points_used: body.loyalty_points_used ?? 0,
    p_loyalty_discount: body.loyalty_discount ?? 0,
    p_items: body.items,
  });

  if (error) return errorResponse(error.message, 400);

  // If loyalty points were used, record the redemption
  if (body.customer_id && body.loyalty_points_used > 0) {
    const service = createServiceClient();
    await service.rpc('redeem_loyalty_points', {
      p_customer_id: body.customer_id,
      p_company_id: auth.companyId,
      p_branch_id: branchId,
      p_order_id: data.order_id,
      p_points_to_redeem: body.loyalty_points_used,
      p_performed_by: auth.userId,
    });
  }

  return jsonResponse(data, 201);
}

// ─── List Orders (paginated) ────────────────────────────────────────────────

async function listOrders(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'order_number', 'total', 'status'],
  );

  let query = supabase
    .from('orders')
    .select('*, order_items(*), order_payments(*)', { count: 'exact' })
    .eq('branch_id', branchId);

  // Filters
  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const orderType = url.searchParams.get('order_type');
  if (orderType) query = query.eq('order_type', orderType);

  const shiftId = url.searchParams.get('shift_id');
  if (shiftId) query = query.eq('shift_id', shiftId);

  const dateFrom = url.searchParams.get('date_from');
  if (dateFrom) query = query.gte('created_at', dateFrom);

  const dateTo = url.searchParams.get('date_to');
  if (dateTo) query = query.lte('created_at', dateTo);

  const ascending = sortDirection === 'ASC';
  query = applyPagination(query, page, pageSize, sortColumn, ascending);

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

// ─── Get Single Order ───────────────────────────────────────────────────────

async function getOrder(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing order id');

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), order_payments(*), order_status_history(*)')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ order: data });
}

// ─── Update Order Status ────────────────────────────────────────────────────

async function updateOrderStatus(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_orders')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.order_id || !body.new_status) {
    return errorResponse('Missing order_id or new_status');
  }

  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: body.order_id,
    p_new_status: body.new_status,
    p_changed_by: auth.userId,
    p_changed_by_name: body.changed_by_name ?? auth.email,
    p_notes: body.notes ?? null,
  });

  if (error) return errorResponse(error.message, 400);

  // If completed and has customer, earn loyalty points
  if (body.new_status === 'completed' && body.customer_id) {
    const service = createServiceClient();
    const { data: order } = await service
      .from('orders')
      .select('total, branch_id')
      .eq('id', body.order_id)
      .single();

    if (order) {
      await service.rpc('earn_loyalty_points', {
        p_customer_id: body.customer_id,
        p_company_id: auth.companyId,
        p_branch_id: order.branch_id,
        p_order_id: body.order_id,
        p_order_total: order.total,
        p_performed_by: auth.userId,
      });
    }
  }

  return jsonResponse(data);
}

// ─── Add Payment to Order ───────────────────────────────────────────────────

async function addPayment(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_orders')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.order_id || !body.payment_method || !body.amount) {
    return errorResponse('Missing order_id, payment_method, or amount');
  }

  const { data: payment, error } = await supabase
    .from('order_payments')
    .insert({
      order_id: body.order_id,
      payment_method: body.payment_method,
      amount: body.amount,
      status: 'paid',
      reference_number: body.reference_number ?? null,
      processed_by: auth.userId,
      processed_by_name: body.processed_by_name ?? auth.email,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Check if order is fully paid
  const { data: payments } = await supabase
    .from('order_payments')
    .select('amount')
    .eq('order_id', body.order_id)
    .eq('status', 'paid');

  const { data: order } = await supabase
    .from('orders')
    .select('total, is_paid')
    .eq('id', body.order_id)
    .single();

  if (payments && order) {
    const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    if (totalPaid >= order.total && !order.is_paid) {
      await supabase
        .from('orders')
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .eq('id', body.order_id);
    }
  }

  return jsonResponse({ payment }, 201);
}

// ─── Void / Cancel Order ────────────────────────────────────────────────────

async function voidOrder(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_orders')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.order_id) return errorResponse('Missing order_id');

  // Use the status update function to cancel
  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: body.order_id,
    p_new_status: 'cancelled',
    p_changed_by: auth.userId,
    p_changed_by_name: body.changed_by_name ?? auth.email,
    p_notes: body.reason ?? 'Order voided',
  });

  if (error) return errorResponse(error.message, 400);

  // TODO: If needed, reverse inventory deductions for cancelled orders
  // This would need a separate DB function

  return jsonResponse(data);
}
