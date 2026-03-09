-- ============================================================================
-- Migration: 00060_fix_rls_branch_staff
-- Description: Fix auth_branch_ids() and auth_permissions() for branch staff.
--
--   The COALESCE pattern `COALESCE(ARRAY(SELECT ...), fallback)` is broken:
--   `ARRAY(SELECT jsonb_array_elements_text(NULL))` returns '{}' (empty array),
--   NOT NULL, so COALESCE never falls through to the profiles table lookup.
--
--   This caused branch staff to always get an empty branch_ids array from RLS,
--   making all branch-scoped queries return no rows.
--
--   Fix: Skip the JWT app_metadata lookup (hook is not enabled) and read
--   directly from the profiles table for branch staff.
-- ============================================================================

-- ─── Fix auth_branch_ids() ──────────────────────────────────────────────────
-- Global staff: return all company branches (unchanged from migration 00016).
-- Branch staff: read branch_ids directly from profiles table.

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
        (SELECT branch_ids FROM profiles WHERE id = auth.uid()),
        '{}'::uuid[]
      )
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Fix auth_permissions() ─────────────────────────────────────────────────
-- Same COALESCE bug: ARRAY(SELECT jsonb_array_elements_text(NULL)) returns '{}'
-- instead of NULL, so permissions were never read from profiles for any user.

CREATE OR REPLACE FUNCTION auth_permissions()
RETURNS text[] AS $$
  SELECT COALESCE(
    (SELECT permissions::text[] FROM profiles WHERE id = auth.uid()),
    '{}'::text[]
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
