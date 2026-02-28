-- ============================================================================
-- Migration: 00039_guest_bookings_enum
-- Description:
--   Step 1 of 2: Add accom_guests permission enum value.
--   Must be committed in its own migration before the value can be used
--   in CREATE TABLE / UPDATE statements (PostgreSQL constraint).
-- ============================================================================

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_guests';
