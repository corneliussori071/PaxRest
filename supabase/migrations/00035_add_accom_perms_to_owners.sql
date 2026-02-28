-- Add accommodation permissions to all existing owner, general_manager, and branch_manager profiles
-- who don't already have them

UPDATE profiles
SET permissions = array_cat(
  permissions,
  ARRAY['view_accommodation', 'accom_create_order', 'accom_pending_orders', 'accom_pending_payment', 'accom_create_rooms', 'accom_request_items']::permission_type[]
)
WHERE role IN ('owner', 'general_manager', 'branch_manager')
  AND NOT ('view_accommodation' = ANY(permissions));
