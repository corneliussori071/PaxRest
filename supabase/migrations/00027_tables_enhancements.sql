-- ============================================================================
-- Migration: 00027_tables_enhancements
-- Description: Add maintenance status to table_status enum, add image_url,
--              notes, assigned_customer_name, num_people columns to tables
-- ============================================================================

-- Add 'maintenance' value to table_status enum
ALTER TYPE table_status ADD VALUE IF NOT EXISTS 'maintenance';

-- Add new columns to tables
ALTER TABLE tables ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS assigned_customer_name text;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS num_people int CHECK (num_people IS NULL OR num_people > 0);
