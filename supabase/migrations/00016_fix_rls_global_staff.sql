-- ============================================================================
-- Migration: 00016_fix_rls_global_staff
-- Description: Fix auth_branch_ids() so global staff (owner, general_manager)
--              can access ALL branches within their company, instead of being
--              blocked by empty branch_ids[].
-- ============================================================================

-- Replace auth_branch_ids() to return all company branches for global roles.
-- This fixes RLS policies across ALL branch-scoped tables in one shot.

CREATE OR REPLACE FUNCTION auth_branch_ids()
RETURNS uuid[] AS $$
  SELECT CASE
    WHEN auth_role() IN ('owner', 'general_manager') THEN
      COALESCE(
        (SELECT ARRAY_AGG(id) FROM branches WHERE company_id = auth_company_id()),
        '{}'::uuid[]
      )
    ELSE
      COALESCE(
        (SELECT ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'branch_ids'))::uuid[]),
        (SELECT branch_ids FROM profiles WHERE id = auth.uid()),
        '{}'::uuid[]
      )
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
