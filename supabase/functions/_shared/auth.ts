import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse } from './cors.ts';
import { createServiceClient } from './db.ts';

export interface AuthContext {
  userId: string;
  email: string;
  companyId: string | null;
  branchIds: string[];
  activeBranchId: string | null;
  role: string | null;
  permissions: string[];
  isGlobal: boolean; // true for owner / general_manager
}

/** Roles that are NOT tied to a single branch */
const GLOBAL_ROLES = ['owner', 'general_manager'];

/**
 * Extract and validate auth context from the request.
 * Queries the profiles table for reliable role/permissions data.
 * Returns the AuthContext or a Response (error) you should return immediately.
 */
export async function requireAuth(
  supabase: SupabaseClient,
  _req: Request,
): Promise<AuthContext | Response> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  // Query profile from database for reliable role/permissions
  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('company_id, branch_ids, active_branch_id, role, permissions')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role ?? null;

  return {
    userId: user.id,
    email: user.email ?? '',
    companyId: profile?.company_id ?? null,
    branchIds: profile?.branch_ids ?? [],
    activeBranchId: profile?.active_branch_id ?? null,
    role,
    permissions: profile?.permissions ?? [],
    isGlobal: GLOBAL_ROLES.includes(role ?? ''),
  };
}

/** Check whether a role is global (not branch-tied) */
export function isGlobalRole(role: string | null): boolean {
  return GLOBAL_ROLES.includes(role ?? '');
}

/** Check the auth context has a specific permission */
export function hasPermission(auth: AuthContext, permission: string): boolean {
  return auth.permissions.includes(permission);
}

/** Check the auth context role is at or above the required role */
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  general_manager: 90,
  branch_manager: 80,
  assistant_manager: 70,
  cashier: 60,
  waiter: 50,
  chef: 50,
  bartender: 50,
  shisha_maker: 50,
  rider: 40,
  kitchen_display: 30,
  inventory_clerk: 50,
  shisha_attendant: 50,
  custom: 10,
};

export function hasMinRole(auth: AuthContext, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[auth.role ?? ''] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Ensure branch access.
 * - Global staff (owner/general_manager) can access ANY branch in their company.
 * - Branch staff must have the branch in their branch_ids.
 */
export function canAccessBranch(auth: AuthContext, branchId: string): boolean {
  if (auth.isGlobal) return true; // verified at company level by caller
  return auth.branchIds.includes(branchId);
}

/**
 * Resolve the effective branch id from the request.
 * Priority: x-branch-id header → activeBranchId → first branchIds entry.
 * For global staff, x-branch-id is trusted if present (company-level check
 * happens in the edge function when querying data).
 * Returns null if no branch can be determined (global staff with no selection).
 */
export function resolveBranchId(auth: AuthContext, req: Request): string | null {
  const headerBranch = req.headers.get('x-branch-id');

  if (auth.isGlobal) {
    // Global staff: accept header or active_branch_id (company ownership
    // is verified downstream via company_id filter on the query)
    if (headerBranch && headerBranch !== '__all__') return headerBranch;
    if (auth.activeBranchId) return auth.activeBranchId;
    return null; // no branch selected — caller must handle
  }

  // Branch staff: verify access
  if (headerBranch && auth.branchIds.includes(headerBranch)) return headerBranch;
  if (auth.activeBranchId && auth.branchIds.includes(auth.activeBranchId)) return auth.activeBranchId;
  return auth.branchIds[0] ?? null;
}

/**
 * Like resolveBranchId but returns the special `'__all__'` sentinel when a
 * global staff member explicitly requests all branches (via header or no selection).
 * Branch staff always get their specific branch; never `'__all__'`.
 */
export function resolveBranchIdOrAll(auth: AuthContext, req: Request): string {
  const headerBranch = req.headers.get('x-branch-id');

  if (auth.isGlobal) {
    if (headerBranch === '__all__') return '__all__';
    if (headerBranch) return headerBranch;
    if (auth.activeBranchId) return auth.activeBranchId;
    return '__all__'; // global staff with no branch = all branches
  }

  // Branch staff
  if (headerBranch && auth.branchIds.includes(headerBranch)) return headerBranch;
  if (auth.activeBranchId && auth.branchIds.includes(auth.activeBranchId)) return auth.activeBranchId;
  return auth.branchIds[0] ?? '__all__'; // shouldn't happen for branch staff
}

/**
 * Check if user is a sys_admin. Requires service client to bypass RLS.
 */
export async function isSysAdmin(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from('sys_admins')
    .select('id')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}
