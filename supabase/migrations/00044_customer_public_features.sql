-- ============================================================================
-- Migration: 00044_customer_public_features
-- Description:
--   Stage 3: customer_auth_id column so Supabase Auth users link to customers
--   Stage 4: is_special_request + special_request_notes on orders
--            awaiting_approval status added to order_status enum
-- ============================================================================

-- Link Supabase Auth users to customers CRM rows
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_auth_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS idx_customers_auth_id ON customers(customer_auth_id) WHERE customer_auth_id IS NOT NULL;

-- Special meal request fields on orders (additive, nullable/defaulted)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_special_request boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_request_notes text;

-- Extend order_status enum for special requests needing staff approval
-- Note: ALTER TYPE ADD VALUE is safe and does not rebuild the type
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_approval' BEFORE 'pending';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
