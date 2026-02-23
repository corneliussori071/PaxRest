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
      case 'program':
        return req.method === 'GET'
          ? await getProgram(supabase, auth)
          : await upsertProgram(req, supabase, auth);
      case 'customers':
        return req.method === 'GET'
          ? await listCustomers(req, supabase, auth)
          : await upsertCustomer(req, supabase, auth);
      case 'customer':
        return await getCustomer(req, supabase, auth);
      case 'transactions':
        return await listTransactions(req, supabase, auth);
      case 'earn':
        return await manualEarn(req, supabase, auth, branchId);
      case 'redeem':
        return await manualRedeem(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown loyalty action', 404);
    }
  } catch (err) {
    console.error('Loyalty error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function getProgram(supabase: any, auth: AuthContext) {
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (error) return errorResponse(error.message);
  return jsonResponse({ program: data });
}

async function upsertProgram(req: Request, supabase: any, auth: AuthContext) {
  if (!hasPermission(auth, 'manage_loyalty')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  const record = {
    company_id: auth.companyId,
    name: body.name ? sanitizeString(body.name) : 'Loyalty Program',
    points_per_currency_unit: body.points_per_currency_unit ?? 1,
    redemption_rate: body.redemption_rate ?? 100,
    min_redeem_points: body.min_redeem_points ?? 500,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('loyalty_programs').update(record).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ program: data });
  } else {
    const { data, error } = await supabase
      .from('loyalty_programs').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ program: data }, 201);
  }
}

async function listCustomers(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'loyalty_points_balance', 'total_orders', 'total_spent'],
  );

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('company_id', auth.companyId);

  const search = url.searchParams.get('search');
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getCustomer(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const phone = url.searchParams.get('phone');

  let query = supabase.from('customers').select('*').eq('company_id', auth.companyId);

  if (id) query = query.eq('id', id);
  else if (phone) query = query.eq('phone', phone);
  else return errorResponse('Missing id or phone');

  const { data, error } = await query.maybeSingle();
  if (error) return errorResponse(error.message);
  return jsonResponse({ customer: data });
}

async function upsertCustomer(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.name || !body.phone) return errorResponse('Missing name or phone');

  const record = {
    company_id: auth.companyId,
    name: sanitizeString(body.name),
    phone: body.phone,
    email: body.email ?? null,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('customers').update(record).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ customer: data });
  } else {
    const { data, error } = await supabase
      .from('customers').insert(record).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ customer: data }, 201);
  }
}

async function listTransactions(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customer_id');
  if (!customerId) return errorResponse('Missing customer_id');

  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('loyalty_transactions')
    .select('*', { count: 'exact' })
    .eq('customer_id', customerId)
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return errorResponse(error.message);
  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function manualEarn(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_loyalty')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.customer_id || !body.points) return errorResponse('Missing customer_id or points');

  // Manual earn (not tied to an order)
  const { data: customer } = await supabase
    .from('customers')
    .select('loyalty_points_balance')
    .eq('id', body.customer_id)
    .single();

  if (!customer) return errorResponse('Customer not found', 404);

  const newBalance = customer.loyalty_points_balance + body.points;

  await supabase
    .from('customers')
    .update({
      loyalty_points_balance: newBalance,
      total_points_earned: supabase.rpc ? customer.total_points_earned + body.points : newBalance,
    })
    .eq('id', body.customer_id);

  await supabase.from('loyalty_transactions').insert({
    customer_id: body.customer_id,
    company_id: auth.companyId,
    branch_id: branchId,
    type: 'manual_credit',
    points: body.points,
    balance_after: newBalance,
    description: body.reason ? sanitizeString(body.reason) : 'Manual credit',
    performed_by: auth.userId,
  });

  return jsonResponse({ new_balance: newBalance });
}

async function manualRedeem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_loyalty')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.customer_id || !body.points) return errorResponse('Missing customer_id or points');

  const { data: customer } = await supabase
    .from('customers')
    .select('loyalty_points_balance')
    .eq('id', body.customer_id)
    .single();

  if (!customer) return errorResponse('Customer not found', 404);
  if (customer.loyalty_points_balance < body.points) {
    return errorResponse('Insufficient points');
  }

  const newBalance = customer.loyalty_points_balance - body.points;

  await supabase
    .from('customers')
    .update({ loyalty_points_balance: newBalance })
    .eq('id', body.customer_id);

  await supabase.from('loyalty_transactions').insert({
    customer_id: body.customer_id,
    company_id: auth.companyId,
    branch_id: branchId,
    type: 'manual_debit',
    points: -body.points,
    balance_after: newBalance,
    description: body.reason ? sanitizeString(body.reason) : 'Manual debit',
    performed_by: auth.userId,
  });

  return jsonResponse({ new_balance: newBalance });
}
