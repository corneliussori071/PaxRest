-- ============================================================================
-- Migration: 00046_grant_manage_other_services
-- Description:
--   Grants the manage_other_services permission to owners & general_managers.
--   Separated from 00045 because ALTER TYPE ADD VALUE cannot be referenced
--   in the same transaction.
-- ============================================================================

UPDATE profiles
SET permissions = array_append(permissions, 'manage_other_services'::permission_type)
WHERE role IN ('owner', 'general_manager')
  AND NOT ('manage_other_services'::permission_type = ANY(permissions));
