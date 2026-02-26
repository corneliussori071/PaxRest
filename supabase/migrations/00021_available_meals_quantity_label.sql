-- Migration: Add quantity_label to available_meals
-- Stores the human-readable quantity description (e.g. "2 pots", "1 tray")
-- so terminal staff see the original quantity set during assignment.

ALTER TABLE available_meals
  ADD COLUMN IF NOT EXISTS quantity_label text NOT NULL DEFAULT '';
