-- ============================================================================
-- Migration: 00032_add_bar_shisha_movement_types
-- Description:
--   Add bar_request, bar_return, shisha_request, shisha_return to the
--   stock_movement_type enum. Previously only kitchen_request and
--   kitchen_return existed (00023), so disbursing to bar/shisha failed
--   with an invalid enum value on the stock_movements insert.
-- ============================================================================

ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'bar_request';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'bar_return';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'shisha_request';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'shisha_return';
