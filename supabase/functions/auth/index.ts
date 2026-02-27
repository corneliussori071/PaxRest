import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse,
  jsonResponse,
  errorResponse,
  createUserClient,
  createServiceClient,
  isValidEmail,
  sanitizeString,
} from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();

  try {
    switch (action) {
      case 'register':
        return await handleRegister(req);
      case 'complete-registration':
        return await handleCompleteRegistration(req);
      case 'accept-invitation':
        return await handleAcceptInvitation(req);
      case 'profile':
        return await handleGetProfile(req);
      case 'update-profile':
        return await handleUpdateProfile(req);
      case 'switch-branch':
        return await handleSwitchBranch(req);
      default:
        return errorResponse('Unknown auth action', 404);
    }
  } catch (err) {
    console.error('Auth error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

const OWNER_PERMISSIONS = [
  'manage_menu', 'manage_orders', 'manage_inventory', 'manage_staff',
  'manage_tables', 'manage_delivery', 'manage_settings', 'manage_shifts',
  'manage_loyalty', 'view_reports', 'export_reports', 'view_audit',
  'manage_wastage', 'manage_suppliers', 'manage_purchases',
  'manage_branches', 'process_pos', 'admin_panel', 'view_kitchen',
  'kitchen_orders', 'kitchen_assignments', 'kitchen_make_dish',
  'kitchen_available_meals', 'kitchen_completed', 'kitchen_ingredient_requests',
  'view_bar',
];

// --- Register: Create company + owner profile (no branch) ---

async function handleRegister(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();

  const { email, password, full_name, company_name, phone } = body;
  if (!email || !password || !full_name || !company_name) {
    return errorResponse('Missing required fields: email, password, full_name, company_name');
  }
  if (!isValidEmail(email)) return errorResponse('Invalid email format');
  if (password.length < 8) return errorResponse('Password must be at least 8 characters');

  const service = createServiceClient();

  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return errorResponse('Email already registered', 409);

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) return errorResponse(authError.message, 400);
  const userId = authData.user.id;

  const slug = sanitizeString(company_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { data: company, error: companyError } = await service
    .from('companies')
    .insert({
      name: sanitizeString(company_name),
      slug,
      owner_id: userId,
      subscription_tier: 'starter',
    })
    .select()
    .single();

  if (companyError) {
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create company: ' + companyError.message);
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: userId,
    company_id: company.id,
    email,
    name: sanitizeString(full_name),
    phone: phone ?? null,
    role: 'owner',
    permissions: OWNER_PERMISSIONS,
    branch_ids: [],
    active_branch_id: null,
    is_active: true,
  });

  if (profileError) {
    await service.from('companies').delete().eq('id', company.id);
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create profile: ' + profileError.message);
  }

  return jsonResponse({
    user: { id: userId, email, full_name },
    company: { id: company.id, name: company.name, slug: company.slug },
  }, 201);
}

// --- Complete Registration (from pending) ---

async function handleCompleteRegistration(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const { registration_id, password } = body;
  if (!registration_id || !password) return errorResponse('Missing registration_id or password');

  const service = createServiceClient();
  const { data: pending } = await service
    .from('pending_registrations')
    .select('*')
    .eq('id', registration_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (!pending) return errorResponse('Registration not found or expired', 404);

  if (new Date(pending.expires_at) < new Date()) {
    await service.from('pending_registrations').update({ status: 'expired' }).eq('id', registration_id);
    return errorResponse('Registration link has expired', 410);
  }

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: pending.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: pending.company_name },
  });

  if (authError) return errorResponse(authError.message, 400);
  const userId = authData.user.id;
  const slug = pending.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const { data: company } = await service
    .from('companies')
    .insert({ name: pending.company_name, slug, owner_id: userId, subscription_tier: 'starter' })
    .select()
    .single();

  await service.from('profiles').insert({
    id: userId,
    company_id: company!.id,
    email: pending.email,
    name: pending.company_name,
    role: 'owner',
    permissions: OWNER_PERMISSIONS,
    branch_ids: [],
    active_branch_id: null,
    is_active: true,
  });

  await service.from('pending_registrations').update({ status: 'completed' }).eq('id', registration_id);
  return jsonResponse({ user: { id: userId, email: pending.email }, company }, 201);
}

// --- Accept Invitation ---

async function handleAcceptInvitation(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const { invitation_id, password, full_name } = body;
  if (!invitation_id || !password || !full_name) {
    return errorResponse('Missing invitation_id, password, or full_name');
  }

  const service = createServiceClient();
  const { data: invitation } = await service
    .from('invitations')
    .select('*')
    .eq('id', invitation_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (!invitation) return errorResponse('Invitation not found or already used', 404);

  if (new Date(invitation.expires_at) < new Date()) {
    await service.from('invitations').update({ status: 'expired' }).eq('id', invitation_id);
    return errorResponse('Invitation has expired', 410);
  }

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) return errorResponse(authError.message, 400);
  const userId = authData.user.id;
  const branchIds = invitation.branch_id ? [invitation.branch_id] : [];

  await service.from('profiles').insert({
    id: userId,
    company_id: invitation.company_id,
    email: invitation.email,
    name: sanitizeString(full_name),
    role: invitation.role,
    permissions: invitation.permissions ?? [],
    branch_ids: branchIds,
    active_branch_id: invitation.branch_id ?? null,
    is_active: true,
  });

  await service.from('invitations').update({ status: 'accepted' }).eq('id', invitation_id);

  return jsonResponse({
    user: { id: userId, email: invitation.email, full_name },
    company_id: invitation.company_id,
    role: invitation.role,
  }, 201);
}

// --- Get Profile ---

async function handleGetProfile(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const service = createServiceClient();

  const { data: profile } = await service
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return errorResponse('Profile not found', 404);

  const { data: company } = await service
    .from('companies')
    .select('*')
    .eq('id', profile.company_id)
    .single();

  // Return all company branches
  const { data: branches } = await service
    .from('branches')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true });

  return jsonResponse({
    profile,
    company: company ?? null,
    branches: branches ?? [],
  });
}

// --- Update Profile ---

async function handleUpdateProfile(req: Request) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const body = await req.json();
  const service = createServiceClient();
  const updates: Record<string, unknown> = {};

  if (body.name) updates.name = sanitizeString(body.name);
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

  const { data, error: updateError } = await service
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (updateError) return errorResponse(updateError.message);
  return jsonResponse({ profile: data });
}

// --- Switch Active Branch ---

async function handleSwitchBranch(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const { branch_id } = await req.json();
  if (!branch_id) return errorResponse('Missing branch_id');

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('role, company_id, branch_ids')
    .eq('id', user.id)
    .single();

  if (!profile) return errorResponse('Profile not found', 404);

  const isGlobal = profile.role === 'owner' || profile.role === 'general_manager';

  if (!isGlobal && !profile.branch_ids?.includes(branch_id)) {
    return errorResponse('You do not have access to this branch', 403);
  }

  if (isGlobal) {
    const { data: branch } = await service
      .from('branches')
      .select('id')
      .eq('id', branch_id)
      .eq('company_id', profile.company_id)
      .maybeSingle();
    if (!branch) return errorResponse('Branch not found in your company', 404);
  }

  await service.from('profiles').update({ active_branch_id: branch_id }).eq('id', user.id);
  return jsonResponse({ active_branch_id: branch_id });
}
