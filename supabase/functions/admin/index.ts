import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, isSysAdmin, sanitizeString,
  validatePagination, applyPagination,
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

    const service = createServiceClient();
    const isAdmin = await isSysAdmin(service, auth.userId);
    if (!isAdmin) return errorResponse('Forbidden: sys_admin access required', 403);

    switch (action) {
      case 'companies':
        return req.method === 'GET'
          ? await listCompanies(req, service)
          : errorResponse('Method not allowed', 405);
      case 'company':
        return await manageCompany(req, service);
      case 'platform-stats':
        return await getPlatformStats(service);
      case 'subscriptions':
        return await listSubscriptions(req, service);
      case 'emergency':
        return await toggleEmergency(req, service, auth);
      case 'impersonate':
        return await impersonateUser(req, service, auth);
      case 'broadcast':
        return await sendBroadcast(req, service, auth);
      case 'audit-log':
        return await getAuditLog(req, service);
      default:
        return errorResponse('Unknown admin action', 404);
    }
  } catch (err) {
    console.error('Admin error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listCompanies(req: Request, service: any) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'subscription_tier'],
  );

  let query = service
    .from('companies')
    .select('*, branches(count), profiles(count)', { count: 'exact' });

  const search = url.searchParams.get('search');
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);

  const tier = url.searchParams.get('tier');
  if (tier) query = query.eq('subscription_tier', tier);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function manageCompany(req: Request, service: any) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return errorResponse('Missing company id');
    const { data, error } = await service
      .from('companies')
      .select('*, branches(*), profiles(id, full_name, email, role, is_active)')
      .eq('id', id)
      .single();
    if (error) return errorResponse(error.message, 404);
    return jsonResponse({ company: data });
  }

  if (req.method === 'PUT') {
    const body = await req.json();
    if (!body.id) return errorResponse('Missing company id');
    const updates: Record<string, unknown> = {};
    const allowed = ['name', 'is_active', 'subscription_tier', 'subscription_status', 'settings'];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const { data, error } = await service
      .from('companies').update(updates).eq('id', body.id).select().single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ company: data });
  }

  return errorResponse('Method not allowed', 405);
}

async function getPlatformStats(service: any) {
  const { count: totalCompanies } = await service.from('companies').select('id', { count: 'exact', head: true });
  const { count: activeCompanies } = await service.from('companies').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const { count: totalUsers } = await service.from('profiles').select('id', { count: 'exact', head: true });
  const { count: totalOrders } = await service.from('orders').select('id', { count: 'exact', head: true });

  // Today's orders
  const today = new Date().toISOString().split('T')[0];
  const { count: todayOrders } = await service
    .from('orders').select('id', { count: 'exact', head: true })
    .gte('created_at', today + 'T00:00:00');

  return jsonResponse({
    total_companies: totalCompanies ?? 0,
    active_companies: activeCompanies ?? 0,
    total_users: totalUsers ?? 0,
    total_orders: totalOrders ?? 0,
    today_orders: todayOrders ?? 0,
  });
}

async function listSubscriptions(req: Request, service: any) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await service
    .from('subscription_payments')
    .select('*, companies(name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return errorResponse(error.message);
  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function toggleEmergency(req: Request, service: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.company_id) return errorResponse('Missing company_id');

  const { data: existing } = await service
    .from('emergency_controls')
    .select('*')
    .eq('company_id', body.company_id)
    .eq('is_active', true)
    .maybeSingle();

  if (existing) {
    // Deactivate
    await service.from('emergency_controls').update({ is_active: false, resolved_at: new Date().toISOString(), resolved_by: auth.userId }).eq('id', existing.id);
    return jsonResponse({ emergency: false });
  } else {
    // Activate
    const { data } = await service.from('emergency_controls').insert({
      company_id: body.company_id,
      reason: body.reason ?? 'Emergency activated by admin',
      activated_by: auth.userId,
      is_active: true,
    }).select().single();
    return jsonResponse({ emergency: true, control: data });
  }
}

async function impersonateUser(req: Request, service: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.user_id) return errorResponse('Missing user_id');

  // Log the impersonation
  await service.from('sys_audit_logs').insert({
    admin_id: auth.userId,
    action: 'impersonate',
    target_type: 'user',
    target_id: body.user_id,
    details: { reason: body.reason ?? 'Admin impersonation' },
  });

  // Generate a token for the target user
  // Note: This requires service role access
  const { data, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: body.email,
  });

  if (error) return errorResponse('Failed to generate impersonation link: ' + error.message);
  return jsonResponse({ link: data });
}

async function sendBroadcast(req: Request, service: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.subject || !body.message) return errorResponse('Missing subject or message');

  const { data, error } = await service.from('email_broadcasts').insert({
    subject: sanitizeString(body.subject),
    message: body.message,
    target_tier: body.target_tier ?? null,
    sent_by: auth.userId,
    status: 'pending',
  }).select().single();

  if (error) return errorResponse(error.message);

  // TODO: Trigger actual email sending via SendGrid
  // For now, just record the broadcast

  return jsonResponse({ broadcast: data }, 201);
}

async function getAuditLog(req: Request, service: any) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await service
    .from('sys_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return errorResponse(error.message);
  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}
