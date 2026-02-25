import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, resolveBranchId, sanitizeString,
  validatePagination, applyPagination,
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
          ? await getCompany(auth)
          : await updateCompany(req, auth);
      case 'branches':
        return req.method === 'GET'
          ? await listBranches(req, auth)
          : await createBranch(req, auth);
      case 'branch':
        return req.method === 'GET'
          ? await getBranch(req, auth)
          : await updateBranch(req, auth);
      default:
        return errorResponse('Unknown store action', 404);
    }
  } catch (err) {
    console.error('Store error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function getCompany(auth: AuthContext) {
  if (!auth.companyId) return errorResponse('No company associated', 400);
  const service = createServiceClient();
  const { data, error } = await service
    .from('companies')
    .select('*')
    .eq('id', auth.companyId)
    .single();
  if (error) return errorResponse(error.message);
  return jsonResponse({ company: data });
}

async function updateCompany(req: Request, auth: AuthContext) {
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

  const service = createServiceClient();
  const { data, error } = await service
    .from('companies')
    .update(updates)
    .eq('id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ company: data });
}

async function listBranches(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const pageParam = url.searchParams.get('page');
  const service = createServiceClient();

  // Support paginated mode (for BranchesPage DataTable)
  if (pageParam) {
    const { page, pageSize, sortColumn, sortDirection } = validatePagination(
      {
        page: Number(pageParam),
        page_size: Number(url.searchParams.get('page_size')),
        sort_column: url.searchParams.get('sort_column') ?? undefined,
        sort_direction: url.searchParams.get('sort_direction') ?? undefined,
      },
      ['created_at', 'name', 'location'],
    );

    let query = service
      .from('branches')
      .select('*', { count: 'exact' })
      .eq('company_id', auth.companyId);

    const search = url.searchParams.get('search');
    if (search) query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%`);

    query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
    const { data, count, error } = await query;
    if (error) return errorResponse(error.message);

    return jsonResponse({
      items: data, total: count, page, page_size: pageSize,
      total_pages: Math.ceil((count ?? 0) / pageSize),
    });
  }

  // Non-paginated: return all branches (for dropdowns, selectors)
  const { data, error } = await service
    .from('branches')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ branches: data });
}

async function createBranch(req: Request, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_branches')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.name || !body.location) return errorResponse('Branch name and location are required');

  const slug = sanitizeString(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const service = createServiceClient();

  const { data, error } = await service
    .from('branches')
    .insert({
      company_id: auth.companyId,
      name: sanitizeString(body.name),
      slug,
      location: sanitizeString(body.location),
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      timezone: body.timezone ?? 'UTC',
      settings: body.settings ?? {},
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // For branch staff, add the new branch to their branch_ids.
  // Global staff (owner/general_manager) don't carry branch_ids — just
  // set active_branch_id as a convenience if they have none yet.
  if (!auth.isGlobal) {
    const { data: profile } = await service
      .from('profiles')
      .select('branch_ids')
      .eq('id', auth.userId)
      .single();

    const newBranchIds = [...(profile?.branch_ids ?? []), data.id];
    await service
      .from('profiles')
      .update({
        branch_ids: newBranchIds,
        active_branch_id: profile?.branch_ids?.length ? undefined : data.id,
      })
      .eq('id', auth.userId);
  } else if (!auth.activeBranchId) {
    // Global staff with no active branch → set it for convenience
    await service
      .from('profiles')
      .update({ active_branch_id: data.id })
      .eq('id', auth.userId);
  }

  return jsonResponse({ branch: data }, 201);
}

async function getBranch(req: Request, auth: AuthContext) {
  const url = new URL(req.url);
  const branchId = url.searchParams.get('id') ?? resolveBranchId(auth, req);
  if (!branchId) return errorResponse('No branch specified');

  const service = createServiceClient();
  const { data, error } = await service
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .eq('company_id', auth.companyId)
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ branch: data });
}

async function updateBranch(req: Request, auth: AuthContext) {
  if (req.method !== 'PUT') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_branches')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.id) return errorResponse('Missing branch id');

  const updates: Record<string, unknown> = {};
  const allowed = ['name', 'location', 'address', 'phone', 'email', 'timezone', 'is_active', 'settings', 'operating_hours'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates[key] = typeof body[key] === 'string' ? sanitizeString(body[key]) : body[key];
    }
  }
  if (body.name) {
    updates.slug = sanitizeString(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('branches')
    .update(updates)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ branch: data });
}
