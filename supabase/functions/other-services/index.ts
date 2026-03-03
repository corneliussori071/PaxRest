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
      case 'list':
        return await listServices(req, supabase, auth, branchId);
      case 'create':
        return await createService(req, supabase, auth, branchId);
      case 'update':
        return await updateService(req, supabase, auth, branchId);
      case 'delete':
        return await deleteService(req, supabase, auth, branchId);
      case 'toggle-availability':
        return await toggleAvailability(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown other-services action', 404);
    }
  } catch (err) {
    console.error('Other services error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── List Services ──────────────────────────────────────────────────────────

async function listServices(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });
  const search = url.searchParams.get('search') ?? '';
  const availableOnly = url.searchParams.get('available_only') === 'true';

  let query = supabase
    .from('other_services')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('is_active', true);

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }
  if (availableOnly) {
    query = query.eq('is_available', true);
  }

  query = applyPagination(query, page, pageSize, 'name', true);
  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({ services: data ?? [], total: count ?? 0, page, pageSize });
}

// ─── Create Service ─────────────────────────────────────────────────────────

async function createService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();

  if (!body.name?.trim()) return errorResponse('Service name is required');
  if (!body.charge_amount || Number(body.charge_amount) <= 0) return errorResponse('Charge amount must be positive');
  if (!body.charge_duration) return errorResponse('Charge duration is required');

  // Validate media if provided
  if (body.media_url && body.media_type) {
    if (!['image', 'video'].includes(body.media_type)) {
      return errorResponse('Invalid media type (image or video only)');
    }
  }

  const service = createServiceClient();

  // Check duplicate name
  const { data: existing } = await service
    .from('other_services')
    .select('id')
    .eq('branch_id', branchId)
    .eq('name', body.name.trim())
    .eq('is_active', true)
    .maybeSingle();
  if (existing) return errorResponse(`Service "${body.name}" already exists in this branch`);

  const { data, error } = await service
    .from('other_services')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      name: sanitizeString(body.name),
      description: body.description ? sanitizeString(body.description, 2000) : null,
      charge_amount: Number(body.charge_amount),
      charge_duration: sanitizeString(body.charge_duration),
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? null,
      is_available: body.is_available !== false,
      created_by: auth.userId,
      created_by_name: auth.name,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data }, 201);
}

// ─── Update Service ─────────────────────────────────────────────────────────

async function updateService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = sanitizeString(body.name);
  if (body.description !== undefined) updates.description = body.description ? sanitizeString(body.description, 2000) : null;
  if (body.charge_amount !== undefined) updates.charge_amount = Number(body.charge_amount);
  if (body.charge_duration !== undefined) updates.charge_duration = sanitizeString(body.charge_duration);
  if (body.media_url !== undefined) updates.media_url = body.media_url;
  if (body.media_type !== undefined) updates.media_type = body.media_type;
  if (body.is_available !== undefined) updates.is_available = body.is_available;

  const service = createServiceClient();
  const { data, error } = await service
    .from('other_services')
    .update(updates)
    .eq('id', body.service_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data });
}

// ─── Delete Service (soft delete) ───────────────────────────────────────────

async function deleteService(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');

  const service = createServiceClient();
  const { error } = await service
    .from('other_services')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', body.service_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ success: true });
}

// ─── Toggle Availability ────────────────────────────────────────────────────

async function toggleAvailability(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_other_services')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.service_id) return errorResponse('Missing service_id');
  if (body.is_available === undefined) return errorResponse('Missing is_available');

  const service = createServiceClient();
  const { data, error } = await service
    .from('other_services')
    .update({ is_available: body.is_available, updated_at: new Date().toISOString() })
    .eq('id', body.service_id)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ service: data });
}
