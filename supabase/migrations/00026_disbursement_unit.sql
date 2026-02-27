-- ============================================================================
-- Migration: 00026_disbursement_unit
-- Description: Add disbursement_unit to kitchen_store_disbursements so
--   kitchen staff can specify the unit when disbursing (e.g. bowl, kg, pcs).
-- ============================================================================

ALTER TABLE kitchen_store_disbursements
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
