import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, sanitizeString,
  isValidEmail, validatePagination, applyPagination,
  isGlobalRole,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100, general_manager: 80, branch_manager: 60,
  cashier: 40, chef: 40, bartender: 40, shisha_attendant: 40,
  waiter: 40, rider: 30, inventory_clerk: 40, custom: 20,
};

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
        return await listStaff(req, auth);
      case 'get':
        return await getStaffMember(req, auth);
      case 'update':
        return await updateStaffMember(req, auth);
      case 'deactivate':
        return await deactivateStaff(req, auth);
      case 'invite':
        return await inviteStaff(req, auth);
      case 'create-direct':
        return await createStaffDirect(req, auth);
      case 'invitations':
        return await listInvitations(req, auth);
      case 'cancel-invitation':
        return await cancelInvitation(req, auth);
      default:
        return errorResponse('Unknown staff action', 404);
    }
  } catch (err) {
    console.error('Staff error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function listStaff(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'role', 'email'],
  );

  const service = createServiceClient();
  let query = service
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('company_id', auth.companyId);

  const role = url.searchParams.get('role');
  if (role) query = query.eq('role', role);

  const search = url.searchParams.get('search');
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

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

async function getStaffMember(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing staff id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('*')
    .eq('id', id)
    .eq('company_id', auth.companyId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ staff: data });
}

async function updateStaffMember(req: Request, auth: AuthContext) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing staff id');

  if (body.id === auth.userId && body.role) {
    return errorResponse('Cannot change your own role');
  }

  // Enforce role hierarchy
  if (body.role) {
    const callerLevel = ROLE_HIERARCHY[auth.role ?? ''] ?? 0;
    const targetLevel = ROLE_HIERARCHY[body.role] ?? 0;
    if (callerLevel <= targetLevel) {
      return errorResponse('Cannot assign a role equal to or higher than yours', 403);
    }
  }

  const service = createServiceClient();

  // Fetch current profile to detect role transitions
  const { data: current, error: fetchErr } = await service
    .from('profiles')
    .select('role, branch_ids, active_branch_id')
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .single();
  if (fetchErr) return errorResponse(fetchErr.message, 404);

  const updates: Record<string, unknown> = {};

  if (body.name) updates.name = sanitizeString(body.name);
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.permissions) updates.permissions = body.permissions;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const oldRole = current.role;
  const newRole = body.role ?? oldRole;
  if (body.role) updates.role = body.role;

  const wasGlobal = isGlobalRole(oldRole);
  const isNowGlobal = isGlobalRole(newRole);

  if (!wasGlobal && isNowGlobal) {
    // ── Promotion to global: clear branch assignment ─────────────────
    updates.branch_ids = [];
    updates.active_branch_id = null;
  } else if (wasGlobal && !isNowGlobal) {
    // ── Demotion to branch role: must provide a branch ───────────────
    const targetBranch = body.branch_ids?.[0] ?? body.active_branch_id;
    if (!targetBranch) {
      return errorResponse('A branch must be assigned when demoting to a branch role');
    }
    updates.branch_ids = [targetBranch];
    updates.active_branch_id = targetBranch;
  } else if (!isNowGlobal) {
    // ── Branch staff: handle transfer ────────────────────────────────
    if (body.branch_ids) {
      updates.branch_ids = body.branch_ids;
      // If active branch is not in new list, reset to first
      const activeBranch = body.active_branch_id ?? current.active_branch_id;
      updates.active_branch_id = body.branch_ids.includes(activeBranch)
        ? activeBranch
        : body.branch_ids[0] ?? null;
    } else if (body.active_branch_id !== undefined) {
      updates.active_branch_id = body.active_branch_id;
    }
  }
  // Global→Global: no branch changes needed

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

async function deactivateStaff(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing staff id');
  if (body.id === auth.userId) return errorResponse('Cannot deactivate yourself');

  const service = createServiceClient();
  const { error } = await service
    .from('profiles')
    .update({ is_active: body.activate ? true : false })
    .eq('id', body.id)
    .eq('company_id', auth.companyId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

async function inviteStaff(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  if (!body.email || !body.role) return errorResponse('Missing email or role');
  if (!isValidEmail(body.email)) return errorResponse('Invalid email format');

  // Enforce role hierarchy
  const callerLevel = ROLE_HIERARCHY[auth.role ?? ''] ?? 0;
  const targetLevel = ROLE_HIERARCHY[body.role] ?? 0;
  if (callerLevel <= targetLevel) {
    return errorResponse('Cannot invite a user with same or higher role', 403);
  }

  const service = createServiceClient();

  // Check not already a member
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('email', body.email)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (existing) return errorResponse('User is already a member', 409);

  // Get company name for invitation
  const { data: companyData } = await service
    .from('companies')
    .select('name')
    .eq('id', auth.companyId)
    .single();

  const { data: callerProfile } = await service
    .from('profiles')
    .select('name')
    .eq('id', auth.userId)
    .single();

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Global roles don't get a branch assignment
  const effectiveBranchId = isGlobalRole(body.role) ? null : (body.branch_id ?? null);

  const { data: invitation, error } = await service
    .from('invitations')
    .insert({
      company_id: auth.companyId,
      branch_id: effectiveBranchId,
      email: body.email,
      role: body.role,
      permissions: body.permissions ?? [],
      invited_by: auth.userId,
      invited_by_name: callerProfile?.name ?? auth.email,
      company_name: companyData?.name ?? 'Unknown',
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ invitation }, 201);
}

async function createStaffDirect(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  const { email, password, name, phone, role, permissions, branch_id } = body;
  if (!email || !password || !name || !role) {
    return errorResponse('Missing required fields: email, password, name, role');
  }
  if (!isValidEmail(email)) return errorResponse('Invalid email format');
  if (password.length < 8) return errorResponse('Password must be at least 8 characters');

  // Enforce role hierarchy
  const callerLevel = ROLE_HIERARCHY[auth.role ?? ''] ?? 0;
  const targetLevel = ROLE_HIERARCHY[role] ?? 0;
  if (callerLevel <= targetLevel) {
    return errorResponse('Cannot create a user with same or higher role', 403);
  }

  const service = createServiceClient();

  // Check not already a member
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('email', email)
    .eq('company_id', auth.companyId)
    .maybeSingle();

  if (existing) return errorResponse('User is already a member', 409);

  // Create auth user
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (authError) return errorResponse(authError.message, 400);
  const userId = authData.user.id;
  // Global roles don't get a branch assignment
  const branchIds = isGlobalRole(role) ? [] : (branch_id ? [branch_id] : []);
  const effectiveActiveBranch = isGlobalRole(role) ? null : (branch_id ?? null);

  const { data: profile, error: profileError } = await service.from('profiles').insert({
    id: userId,
    company_id: auth.companyId,
    email,
    name: sanitizeString(name),
    phone: phone ?? null,
    role,
    permissions: permissions ?? [],
    branch_ids: branchIds,
    active_branch_id: effectiveActiveBranch,
    is_active: true,
  }).select().single();

  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create staff profile: ' + profileError.message);
  }

  return jsonResponse({ staff: profile }, 201);
}

async function listInvitations(req: Request, auth: AuthContext) {
  const service = createServiceClient();
  const { data, error } = await service
    .from('invitations')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message);
  return jsonResponse({ invitations: data });
}

async function cancelInvitation(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.id) return errorResponse('Missing invitation id');

  const service = createServiceClient();
  const { error } = await service
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .eq('status', 'pending');

  if (error) return errorResponse(error.message);
  return jsonResponse({ cancelled: true });
}
