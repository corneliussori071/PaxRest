-- ============================================================================
-- Migration: 00048_service_bookings_add_created_by
-- Description: Add missing created_by and created_by_name audit columns
--              to service_bookings (matching guest_bookings pattern).
-- ============================================================================

ALTER TABLE service_bookings
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS created_by_name text;
