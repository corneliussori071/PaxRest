import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, hasPermission, validatePagination, applyPagination,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

// ─── Category → Table Name Mapping ──────────────────────────────────────────

const CATEGORY_TABLES: Record<string, string[]> = {
  management:     ['orders', 'order_items', 'tables', 'menu_items', 'menu_categories', 'deliveries'],
  financial:      ['shifts', 'wastage_records', 'purchase_orders'],
  administrative: ['profiles', 'inventory_items'],
};

// Reverse map: table name → category
const TABLE_CATEGORY: Record<string, string> = {};
for (const [cat, tables] of Object.entries(CATEGORY_TABLES)) {
  for (const t of tables) TABLE_CATEGORY[t] = cat;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;

    if (!hasPermission(auth, 'view_audit')) return errorResponse('Forbidden', 403);

    switch (action) {
      case 'list': return await listAuditLogs(req, auth);
      default:     return errorResponse('Unknown audit action', 404);
    }
  } catch (err) {
    console.error('Audit function error:', err);
    return errorResponse((err as Error).message ?? 'Internal server error', 500);
  }
});

// ─── list ────────────────────────────────────────────────────────────────────

async function listAuditLogs(req: Request, auth: AuthContext) {
  const url = new URL(req.url);

  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page:           Number(url.searchParams.get('page')),
      page_size:      Number(url.searchParams.get('page_size')),
      sort_column:    url.searchParams.get('sort_column')  ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at'],
  );

  const search   = url.searchParams.get('search')?.trim() ?? '';
  const category = url.searchParams.get('category')?.trim() ?? '';
  const dateFrom = url.searchParams.get('date_from')?.trim() ?? '';
  const dateTo   = url.searchParams.get('date_to')?.trim() ?? '';
  const branchId = url.searchParams.get('branch_id')?.trim() ?? '';

  const service = createServiceClient();

  // ── Pre-fetch profile IDs matching staff name search ─────────────────────
  let performerIds: string[] = [];
  if (search) {
    const { data: matchingProfiles } = await service
      .from('profiles')
      .select('id')
      .eq('company_id', auth.companyId)
      .ilike('name', `%${search}%`);
    performerIds = (matchingProfiles ?? []).map((p: any) => p.id);
  }

  // ── Build audit_logs query ────────────────────────────────────────────────
  let query = service
    .from('audit_logs')
    .select(
      'id, company_id, branch_id, table_name, record_id, action, old_data, new_data, changed_fields, performed_by, created_at',
      { count: 'exact' },
    )
    .eq('company_id', auth.companyId);

  // Branch isolation
  if (!auth.isGlobal) {
    // Branch staff: restrict to their assigned branch
    if (auth.activeBranchId) {
      query = query.eq('branch_id', auth.activeBranchId);
    } else if (auth.branchIds.length > 0) {
      query = query.in('branch_id', auth.branchIds);
    }
  } else if (branchId && branchId !== '__all__') {
    // Global staff selected a specific branch
    query = query.eq('branch_id', branchId);
  }

  // Category filter (maps tab selection to a set of watched table names)
  if (category && CATEGORY_TABLES[category]) {
    query = query.in('table_name', CATEGORY_TABLES[category]);
  }

  // Date range (inclusive on both ends; add 1 day to dateTo to include full end-day)
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }

  // Search: match against table_name OR previously-resolved performer IDs
  if (search) {
    const tableFilter = `table_name.ilike.%${search}%`;
    if (performerIds.length > 0) {
      query = query.or(`${tableFilter},performed_by.in.(${performerIds.join(',')})`);
    } else {
      // No profiles matched the search term — only filter by table_name
      query = query.ilike('table_name', `%${search}%`);
    }
  }

  // Always newest-first; applyPagination expects ascending: bool
  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');

  const { data: logs, count, error } = await query;
  if (error) return errorResponse(error.message);

  // ── Enrich: resolve performer names + branch names in two batch lookups ───
  const userIds   = [...new Set((logs ?? []).map((l: any) => l.performed_by).filter(Boolean))];
  const bIds      = [...new Set((logs ?? []).map((l: any) => l.branch_id).filter(Boolean))];

  const [profilesRes, branchesRes] = await Promise.all([
    userIds.length > 0
      ? service.from('profiles').select('id, name, role').in('id', userIds)
      : Promise.resolve({ data: [] }),
    bIds.length > 0
      ? service.from('branches').select('id, name').in('id', bIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap: Record<string, { name: string; role: string }> = {};
  (profilesRes.data ?? []).forEach((p: any) => {
    profileMap[p.id] = { name: p.name, role: p.role };
  });

  const branchMap: Record<string, string> = {};
  (branchesRes.data ?? []).forEach((b: any) => {
    branchMap[b.id] = b.name;
  });

  const enriched = (logs ?? []).map((log: any) => ({
    ...log,
    performed_by_name: log.performed_by
      ? (profileMap[log.performed_by]?.name ?? 'Unknown')
      : 'System',
    performed_by_role: log.performed_by
      ? (profileMap[log.performed_by]?.role ?? null)
      : null,
    branch_name: log.branch_id ? (branchMap[log.branch_id] ?? 'Unknown Branch') : null,
    category:    TABLE_CATEGORY[log.table_name] ?? 'management',
  }));

  return jsonResponse({
    items:       enriched,
    total:       count ?? 0,
    page,
    page_size:   pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}
