-- Add cost_per_unit to bar_store_items so inventory price info flows through
ALTER TABLE bar_store_items
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric(10,4) DEFAULT 0;

-- Add selling_price, barcode, cost_per_unit to kitchen_store_items for parity
ALTER TABLE kitchen_store_items
  ADD COLUMN IF NOT EXISTS selling_price numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric(10,4) DEFAULT 0;
