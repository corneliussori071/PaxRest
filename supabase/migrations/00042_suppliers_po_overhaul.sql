-- ============================================================================
-- Migration: 00042_suppliers_po_overhaul
-- Description: Fix suppliers (company-level, no branch_id filter), fix
--              purchase_orders column defaults, extend purchase_order_items
--              for manual items and receipt-review workflow, add 'confirmed'
--              PO status.
-- ============================================================================

-- ─── 1. purchase_order_status: add confirmed ────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres 12+
-- but Supabase migrations are run in an implicit transaction per file.
-- Use DO block trick to add the value safely (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'confirmed'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'purchase_order_status')
  ) THEN
    ALTER TYPE purchase_order_status ADD VALUE 'confirmed' AFTER 'submitted';
  END IF;
END$$;

-- Also ensure 'cancelled' exists (defensive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'cancelled'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'purchase_order_status')
  ) THEN
    ALTER TYPE purchase_order_status ADD VALUE 'cancelled';
  END IF;
END$$;

-- ─── 2. purchase_orders: relax constraints the backend couldn't satisfy ─────
ALTER TABLE purchase_orders
  ALTER COLUMN supplier_name SET DEFAULT '',
  ALTER COLUMN order_number SET DEFAULT '',
  ALTER COLUMN ordered_by_name SET DEFAULT '',
  ALTER COLUMN ordered_by DROP NOT NULL;

-- ─── 3. purchase_order_items: extend for manual items & receipt review ───────
ALTER TABLE purchase_order_items
  -- allow manual items that have no inventory record yet
  ALTER COLUMN inventory_item_id DROP NOT NULL,
  -- give name a default so manual inserts without a name don't fail at DB level
  ALTER COLUMN inventory_item_name SET DEFAULT '',
  -- unit is still useful but manual items might not have one yet
  ALTER COLUMN unit DROP NOT NULL,
  -- receipt review fields
  ADD COLUMN IF NOT EXISTS barcode         text,
  ADD COLUMN IF NOT EXISTS selling_price   numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category        text,
  ADD COLUMN IF NOT EXISTS packaging_type  text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS items_per_pack  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_manual       boolean NOT NULL DEFAULT false,
  -- track receipt review state per-line
  ADD COLUMN IF NOT EXISTS reviewed        boolean NOT NULL DEFAULT false;

-- ─── 4. purchase_orders: add review + inventory-update tracking columns ───────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS reviewed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by           uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_by_name      text,
  ADD COLUMN IF NOT EXISTS inventory_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_updated_by  uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS inventory_updated_by_name text;

-- ─── 5. Notify PostgREST to reload schema cache ──────────────────────────────
NOTIFY pgrst, 'reload schema';
