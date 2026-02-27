-- ============================================================================
-- Migration: 00024_assignment_available_and_return_flow
-- Description:
--   1. Add 'available' to meal_assignment_status enum (so Make Available persists)
--   2. Add quantity_received to ingredient_request_items (kitchen confirms actual qty)
--   3. Add 'return_requested' status for ingredient requests (inventory approves returns)
--   4. Add return tracking columns to ingredient_requests
-- ============================================================================

-- 1. Fix meal_assignment_status: the backend sets status = 'available' but the enum lacked it
ALTER TYPE meal_assignment_status ADD VALUE IF NOT EXISTS 'available';

-- 2. Allow kitchen to record actual quantity received per item
ALTER TABLE ingredient_request_items
  ADD COLUMN IF NOT EXISTS quantity_received numeric(12,4);

-- 3. New status: kitchen requests a return, inventory must approve it
ALTER TYPE ingredient_request_status ADD VALUE IF NOT EXISTS 'return_requested';

-- 4. Track who accepted/rejected the return on inventory side
ALTER TABLE ingredient_requests
  ADD COLUMN IF NOT EXISTS return_accepted_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS return_accepted_by_name text,
  ADD COLUMN IF NOT EXISTS return_response_notes text;
