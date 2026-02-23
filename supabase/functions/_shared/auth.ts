import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse } from './cors.ts';

export interface AuthContext {
  userId: string;
  email: string;
  companyId: string | null;
  branchIds: string[];
  activeBranchId: string | null;
  role: string | null;
  permissions: string[];
}

/**
 * Extract and validate auth context from the request.
 * Returns the AuthContext or a Response (error) you should return immediately.
 */
export async function requireAuth(
  supabase: SupabaseClient,
  req: Request,
): Promise<AuthContext | Response> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const meta = user.app_metadata ?? {};

  return {
    userId: user.id,
    email: user.email ?? '',
    companyId: meta.company_id ?? null,
    branchIds: meta.branch_ids ?? [],
    activeBranchId: meta.active_branch_id ?? null,
    role: meta.role ?? null,
    permissions: meta.permissions ?? [],
  };
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
};

export function hasMinRole(auth: AuthContext, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[auth.role ?? ''] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

/** Ensure branch access — the user must have the branch in their branch_ids */
export function canAccessBranch(auth: AuthContext, branchId: string): boolean {
  return auth.branchIds.includes(branchId);
}

/** Resolve the branch: prefer header, then auth active branch */
export function resolveBranchId(auth: AuthContext, req: Request): string | null {
  const headerBranch = req.headers.get('x-branch-id');
  if (headerBranch && canAccessBranch(auth, headerBranch)) return headerBranch;
  if (auth.activeBranchId && canAccessBranch(auth, auth.activeBranchId)) return auth.activeBranchId;
  return auth.branchIds[0] ?? null;
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
