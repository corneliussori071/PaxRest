import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId, sanitizeString,
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

    switch (action) {
      case 'company':
        return req.method === 'GET'
          ? await getCompany(supabase, auth)
          : await updateCompany(req, supabase, auth);
      case 'branches':
        return req.method === 'GET'
          ? await listBranches(supabase, auth)
          : await createBranch(req, supabase, auth);
      case 'branch':
        return req.method === 'GET'
          ? await getBranch(req, supabase, auth)
          : await updateBranch(req, supabase, auth);
      default:
        return errorResponse('Unknown store action', 404);
    }
  } catch (err) {
    console.error('Store error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function getCompany(supabase: any, auth: AuthContext) {
  if (!auth.companyId) return errorResponse('No company associated', 400);

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', auth.companyId)
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ company: data });
}

async function updateCompany(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_settings')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  const allowed = ['name', 'currency', 'country', 'timezone', 'logo_url', 'settings'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates[key] = typeof body[key] === 'string' ? sanitizeString(body[key]) : body[key];
    }
  }

  if (body.name) {
    updates.slug = sanitizeString(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ company: data });
}

async function listBranches(supabase: any, auth: AuthContext) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ branches: data });
}

async function createBranch(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_settings')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.name) return errorResponse('Missing branch name');

  const slug = sanitizeString(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const { data, error } = await supabase
    .from('branches')
    .insert({
      company_id: auth.companyId,
      name: sanitizeString(body.name),
      slug,
      address: body.address ?? null,
      city: body.city ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      settings: body.settings ?? {},
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Add branch to the creator's branch_ids
  const service = createServiceClient();
  await service.rpc('', {}); // No-op, we'll update directly
  const { data: profile } = await service
    .from('profiles')
    .select('branch_ids')
    .eq('id', auth.userId)
    .single();

  const newBranchIds = [...(profile?.branch_ids ?? []), data.id];
  await service
    .from('profiles')
    .update({ branch_ids: newBranchIds })
    .eq('id', auth.userId);

  return jsonResponse({ branch: data }, 201);
}

async function getBranch(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const branchId = url.searchParams.get('id') ?? resolveBranchId(auth, req);
  if (!branchId) return errorResponse('No branch specified');

  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .eq('company_id', auth.companyId)
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ branch: data });
}

async function updateBranch(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_settings')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.id) return errorResponse('Missing branch id');

  const updates: Record<string, unknown> = {};
  const allowed = ['name', 'address', 'city', 'phone', 'email', 'is_active', 'settings'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates[key] = typeof body[key] === 'string' ? sanitizeString(body[key]) : body[key];
    }
  }

  if (body.name) {
    updates.slug = sanitizeString(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ branch: data });
}
