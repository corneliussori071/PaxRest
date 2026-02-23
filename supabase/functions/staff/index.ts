import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId,
  sanitizeString, isValidEmail, validatePagination, applyPagination,
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

    if (!hasPermission(auth, 'manage_staff')) return errorResponse('Forbidden', 403);

    switch (action) {
      case 'list':
        return await listStaff(req, supabase, auth);
      case 'get':
        return await getStaffMember(req, supabase, auth);
      case 'update':
        return await updateStaffMember(req, supabase, auth);
      case 'deactivate':
        return await deactivateStaff(req, supabase, auth);
      case 'invite':
        return await inviteStaff(req, supabase, auth);
      case 'invitations':
        return await listInvitations(req, supabase, auth);
      case 'cancel-invitation':
        return await cancelInvitation(req, supabase, auth);
      default:
        return errorResponse('Unknown staff action', 404);
    }
  } catch (err) {
    console.error('Staff error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listStaff(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'full_name', 'role', 'email'],
  );

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('company_id', auth.companyId);

  const role = url.searchParams.get('role');
  if (role) query = query.eq('role', role);

  const search = url.searchParams.get('search');
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  const branchId = url.searchParams.get('branch_id');
  if (branchId) query = query.contains('branch_ids', [branchId]);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data, total: count, page, page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getStaffMember(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing staff id');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .eq('company_id', auth.companyId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ staff: data });
}

async function updateStaffMember(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing staff id');

  // Cannot modify yourself through this endpoint for role changes
  if (body.id === auth.userId && body.role) {
    return errorResponse('Cannot change your own role');
  }

  const service = createServiceClient();
  const updates: Record<string, unknown> = {};

  if (body.full_name) updates.full_name = sanitizeString(body.full_name);
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role) updates.role = body.role;
  if (body.permissions) updates.permissions = body.permissions;
  if (body.branch_ids) updates.branch_ids = body.branch_ids;
  if (body.active_branch_id !== undefined) updates.active_branch_id = body.active_branch_id;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await service
    .from('profiles')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ staff: data });
}

async function deactivateStaff(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing staff id');
  if (body.id === auth.userId) return errorResponse('Cannot deactivate yourself');

  const service = createServiceClient();
  const { error } = await service
    .from('profiles')
    .update({ is_active: false })
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deactivated: true });
}

async function inviteStaff(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.email || !body.role) return errorResponse('Missing email or role');
  if (!isValidEmail(body.email)) return errorResponse('Invalid email format');

  // Check not already a member
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', body.email)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (existing) return errorResponse('User is already a member', 409);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({
      company_id: auth.companyId,
      email: body.email,
      role: body.role,
      permissions: body.permissions ?? [],
      branch_ids: body.branch_ids ?? auth.branchIds,
      invited_by: auth.userId,
      invited_by_name: body.invited_by_name ?? auth.email,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // TODO: Send invitation email via SendGrid

  return jsonResponse({ invitation }, 201);
}

async function listInvitations(req: Request, supabase: any, auth: AuthContext) {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message);
  return jsonResponse({ invitations: data });
}

async function cancelInvitation(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing invitation id');

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .eq('status', 'pending');

  if (error) return errorResponse(error.message);
  return jsonResponse({ cancelled: true });
}
