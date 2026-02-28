-- ============================================================================
-- Migration: 00036_fix_accom_perms_idempotent
-- Description:
--   Idempotent fix: ensure accommodation permissions are present on all
--   owner / general_manager / branch_manager profiles.
--   Migration 00035 may have silently failed due to transaction issues
--   from the COMMIT;BEGIN; pattern in migration 00034.
-- ============================================================================

DO $$
DECLARE
  new_perms permission_type[] := ARRAY[
    'view_accommodation',
    'accom_create_order',
    'accom_pending_orders',
    'accom_pending_payment',
    'accom_create_rooms',
    'accom_request_items'
  ]::permission_type[];
  missing permission_type[];
  rec record;
BEGIN
  FOR rec IN
    SELECT id, permissions
    FROM profiles
    WHERE role IN ('owner', 'general_manager', 'branch_manager')
  LOOP
    -- Compute which permissions are missing for this profile
    missing := ARRAY(
      SELECT unnest(new_perms)
      EXCEPT
      SELECT unnest(rec.permissions)
    );

    IF array_length(missing, 1) IS NOT NULL THEN
      UPDATE profiles
      SET permissions = array_cat(permissions, missing)
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Reload PostgREST schema cache so new enum values are recognized
NOTIFY pgrst, 'reload schema';
