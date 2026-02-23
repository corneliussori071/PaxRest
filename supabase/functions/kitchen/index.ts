import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, resolveBranchId,
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
      case 'orders':
        return await getKitchenOrders(req, supabase, auth, branchId);
      case 'update-item':
        return await updateItemStatus(req, supabase, auth);
      case 'bump':
        return await bumpOrder(req, supabase, auth);
      case 'recall':
        return await recallOrder(req, supabase, auth);
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

  // Get active orders with items for this station
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, order_type, table_id, customer_name, notes, created_at, status, order_items(*)')
    .eq('branch_id', branchId)
    .in('status', ['pending', 'confirmed', 'preparing'])
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message);

  // Filter orders that have items for this station
  const filtered = (orders ?? [])
    .map((order: any) => ({
      ...order,
      order_items: order.order_items.filter(
        (item: any) => item.station === station && item.status !== 'cancelled',
      ),
    }))
    .filter((order: any) => order.order_items.length > 0);

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
  if (body.new_status === 'preparing') {
    updates.started_at = new Date().toISOString();
  } else if (body.new_status === 'ready') {
    updates.completed_at = new Date().toISOString();
  } else if (body.new_status === 'served') {
    updates.served_at = new Date().toISOString();
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
    const orderId = data.order_id;
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

  return jsonResponse({ item: data });
}

// ─── Bump Order (mark all items as ready) ───────────────────────────────────

async function bumpOrder(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.order_id) return errorResponse('Missing order_id');
  const station = body.station ?? 'kitchen';

  // Mark all items for this station as ready
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'ready', completed_at: now })
    .eq('order_id', body.order_id)
    .eq('station', station)
    .in('status', ['pending', 'preparing']);

  if (error) return errorResponse(error.message);

  // Check if entire order is ready
  const { data: items } = await supabase
    .from('order_items')
    .select('status')
    .eq('order_id', body.order_id)
    .neq('status', 'cancelled');

  const allReady = items?.every((item: any) => item.status === 'ready' || item.status === 'served');
  if (allReady) {
    await supabase
      .from('orders')
      .update({ status: 'ready' })
      .eq('id', body.order_id);
  }

  return jsonResponse({ bumped: true });
}

// ─── Recall Order (move back to preparing) ──────────────────────────────────

async function recallOrder(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.order_id) return errorResponse('Missing order_id');

  await supabase
    .from('order_items')
    .update({ status: 'preparing', completed_at: null })
    .eq('order_id', body.order_id)
    .eq('status', 'ready');

  await supabase
    .from('orders')
    .update({ status: 'preparing' })
    .eq('id', body.order_id)
    .eq('status', 'ready');

  return jsonResponse({ recalled: true });
}
