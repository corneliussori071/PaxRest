-- Migration: 00029_add_view_bar_permission
-- Description: Add view_bar permission to existing owner/admin profiles

-- Add view_bar to all profiles that have view_kitchen (owners/admins who already
-- have full access) but don't yet have view_bar
UPDATE profiles
SET permissions = array_append(permissions, 'view_bar')
WHERE 'view_kitchen' = ANY(permissions)
  AND NOT ('view_bar' = ANY(permissions));
