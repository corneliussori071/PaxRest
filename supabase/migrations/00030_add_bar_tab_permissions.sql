-- Add bar tab permission enum values
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'bar_create_order';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'bar_pending_orders';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'bar_pending_payment';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'bar_request_items';

-- Grant bar tab permissions to existing profiles that have view_bar
-- (must be in separate transaction because ALTER TYPE ... ADD VALUE cannot run inside a multi-statement txn)
-- Supabase runs each migration file in its own transaction, so we commit here
-- and do the UPDATE in a DO block after
COMMIT;
BEGIN;

UPDATE profiles
SET permissions = permissions || ARRAY[
  'bar_create_order'::permission_type,
  'bar_pending_orders'::permission_type,
  'bar_pending_payment'::permission_type,
  'bar_request_items'::permission_type
]
WHERE 'view_bar' = ANY(permissions)
  AND NOT ('bar_create_order' = ANY(permissions));
