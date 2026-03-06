-- ============================================================================
-- Migration: 00049_add_enum_values
-- Description:
--   1. Add 'other_services' to kitchen_station enum (used by other-services
--      order items / extensions).
--   2. Add 'accommodation' to order_type enum (required for online room
--      bookings via create_order_with_deduction RPC).
-- ============================================================================

ALTER TYPE kitchen_station ADD VALUE IF NOT EXISTS 'other_services';
ALTER TYPE order_type      ADD VALUE IF NOT EXISTS 'accommodation';
