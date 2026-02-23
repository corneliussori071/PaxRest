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

// ─── Register: Create company + owner profile ───────────────────────────────

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

  // Check if already registered
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return errorResponse('Email already registered', 409);

  // Create auth user
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) return errorResponse(authError.message, 400);
  const userId = authData.user.id;

  // Create company
  const slug = sanitizeString(company_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { data: company, error: companyError } = await service
    .from('companies')
    .insert({
      name: sanitizeString(company_name),
      slug,
      subscription_tier: 'starter',
      subscription_status: 'active',
    })
    .select()
    .single();

  if (companyError) {
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create company: ' + companyError.message);
  }

  // Create default branch
  const { data: branch, error: branchError } = await service
    .from('branches')
    .insert({
      company_id: company.id,
      name: 'Main Branch',
      slug: 'main',
    })
    .select()
    .single();

  if (branchError) {
    await service.from('companies').delete().eq('id', company.id);
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create branch: ' + branchError.message);
  }

  // Create owner profile
  const { error: profileError } = await service.from('profiles').insert({
    id: userId,
    company_id: company.id,
    email,
    full_name: sanitizeString(full_name),
    phone: phone ?? null,
    role: 'owner',
    permissions: [
      'manage_menu', 'manage_orders', 'manage_inventory', 'manage_staff',
      'manage_tables', 'manage_delivery', 'manage_settings', 'manage_shifts',
      'manage_loyalty', 'manage_reports', 'view_audit', 'manage_wastage',
      'manage_suppliers', 'manage_purchases',
    ],
    branch_ids: [branch.id],
    active_branch_id: branch.id,
    is_active: true,
  });

  if (profileError) {
    await service.from('branches').delete().eq('id', branch.id);
    await service.from('companies').delete().eq('id', company.id);
    await service.auth.admin.deleteUser(userId);
    return errorResponse('Failed to create profile: ' + profileError.message);
  }

  return jsonResponse({
    user: { id: userId, email, full_name },
    company: { id: company.id, name: company.name, slug: company.slug },
    branch: { id: branch.id, name: branch.name },
  }, 201);
}

// ─── Complete Registration (from pending) ───────────────────────────────────

async function handleCompleteRegistration(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  const { registration_id, password } = body;
  if (!registration_id || !password) return errorResponse('Missing registration_id or password');

  const service = createServiceClient();
  const { data: pending, error } = await service
    .from('pending_registrations')
    .select('*')
    .eq('id', registration_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (!pending) return errorResponse('Registration not found or expired', 404);

  // Check if expired
  if (new Date(pending.expires_at) < new Date()) {
    await service.from('pending_registrations').update({ status: 'expired' }).eq('id', registration_id);
    return errorResponse('Registration link has expired', 410);
  }

  // Proceed like register but using pending data
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
    .insert({ name: pending.company_name, slug, subscription_tier: 'starter', subscription_status: 'active' })
    .select()
    .single();

  const { data: branch } = await service
    .from('branches')
    .insert({ company_id: company!.id, name: 'Main Branch', slug: 'main' })
    .select()
    .single();

  await service.from('profiles').insert({
    id: userId,
    company_id: company!.id,
    email: pending.email,
    full_name: pending.company_name,
    role: 'owner',
    permissions: [
      'manage_menu', 'manage_orders', 'manage_inventory', 'manage_staff',
      'manage_tables', 'manage_delivery', 'manage_settings', 'manage_shifts',
      'manage_loyalty', 'manage_reports', 'view_audit', 'manage_wastage',
      'manage_suppliers', 'manage_purchases',
    ],
    branch_ids: [branch!.id],
    active_branch_id: branch!.id,
    is_active: true,
  });

  await service.from('pending_registrations').update({ status: 'completed' }).eq('id', registration_id);

  return jsonResponse({ user: { id: userId, email: pending.email }, company, branch }, 201);
}

// ─── Accept Invitation ──────────────────────────────────────────────────────

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

  // Create auth user
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) return errorResponse(authError.message, 400);

  const userId = authData.user.id;

  // Create profile
  await service.from('profiles').insert({
    id: userId,
    company_id: invitation.company_id,
    email: invitation.email,
    full_name: sanitizeString(full_name),
    role: invitation.role,
    permissions: invitation.permissions ?? [],
    branch_ids: invitation.branch_ids ?? [],
    active_branch_id: invitation.branch_ids?.[0] ?? null,
    is_active: true,
  });

  // Mark invitation as accepted
  await service.from('invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invitation_id);

  return jsonResponse({
    user: { id: userId, email: invitation.email, full_name },
    company_id: invitation.company_id,
    role: invitation.role,
  }, 201);
}

// ─── Get Profile ────────────────────────────────────────────────────────────

async function handleGetProfile(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, companies(id, name, slug, currency, country, timezone, subscription_tier, subscription_status, settings)')
    .eq('id', user.id)
    .single();

  if (!profile) return errorResponse('Profile not found', 404);

  // Get branch details
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, slug, address, city, phone, is_active')
    .in('id', profile.branch_ids ?? []);

  return jsonResponse({ profile, branches: branches ?? [] });
}

// ─── Update Profile ─────────────────────────────────────────────────────────

async function handleUpdateProfile(req: Request) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.full_name) updates.full_name = sanitizeString(body.full_name);
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

  const { data, error: updateError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (updateError) return errorResponse(updateError.message);

  return jsonResponse({ profile: data });
}

// ─── Switch Active Branch ───────────────────────────────────────────────────

async function handleSwitchBranch(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const supabase = createUserClient(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return errorResponse('Unauthorized', 401);

  const { branch_id } = await req.json();
  if (!branch_id) return errorResponse('Missing branch_id');

  // Verify access
  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_ids')
    .eq('id', user.id)
    .single();

  if (!profile?.branch_ids?.includes(branch_id)) {
    return errorResponse('You do not have access to this branch', 403);
  }

  await supabase
    .from('profiles')
    .update({ active_branch_id: branch_id })
    .eq('id', user.id);

  return jsonResponse({ active_branch_id: branch_id });
}
