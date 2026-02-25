-- ============================================================================
-- Migration: 00019_kitchen_permissions_migrate
-- Description: Migrate existing view_kitchen users to granular kitchen perms
-- ============================================================================

-- Migrate existing staff: anyone with 'view_kitchen' gets all 6 new kitchen perms
-- so that existing users aren't locked out after this migration.
UPDATE profiles
SET permissions = array_cat(
  permissions,
  ARRAY[
    'kitchen_orders'::permission_type,
    'kitchen_assignments'::permission_type,
    'kitchen_make_dish'::permission_type,
    'kitchen_available_meals'::permission_type,
    'kitchen_completed'::permission_type,
    'kitchen_ingredient_requests'::permission_type
  ]
)
WHERE 'view_kitchen' = ANY(permissions);
