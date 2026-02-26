-- Migration: Add availability_status to available_meals
-- This allows kitchen staff to update the availability level of each meal
-- independently from the menu_items availability.

ALTER TABLE available_meals
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'full'
    CHECK (availability_status IN ('full', 'half', 'thirty_pct', 'ten_pct', 'unavailable'));

-- Add an index for quick filtering
CREATE INDEX IF NOT EXISTS idx_available_meals_status ON available_meals (branch_id, availability_status);
