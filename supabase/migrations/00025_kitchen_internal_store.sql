-- ============================================================================
-- Migration: 00025_kitchen_internal_store
-- Description:
--   Kitchen Internal Store — isolated stock tracking for ingredients received
--   from the central Inventory store. Automatically stocked when requests are
--   marked 'received' and deducted on returns/meal-prep disbursements.
-- ============================================================================

-- 1. Kitchen Internal Store — one row per inventory item per branch
CREATE TABLE IF NOT EXISTS kitchen_store_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  branch_id    uuid NOT NULL REFERENCES branches(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  item_name    text NOT NULL,
  unit         text NOT NULL DEFAULT 'pcs',
  quantity     numeric(12,4) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, inventory_item_id)
);

-- 2. Kitchen Internal Disbursements — tracks each disbursement from internal store
CREATE TABLE IF NOT EXISTS kitchen_store_disbursements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  branch_id         uuid NOT NULL REFERENCES branches(id),
  kitchen_store_item_id uuid NOT NULL REFERENCES kitchen_store_items(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  quantity          numeric(12,4) NOT NULL,
  reason            text NOT NULL,
  disbursed_to_id   uuid REFERENCES profiles(id),
  disbursed_to_name text NOT NULL,
  disbursed_by      uuid NOT NULL REFERENCES profiles(id),
  disbursed_by_name text NOT NULL,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES profiles(id),
  cancelled_by_name text,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. Kitchen Store Movements — audit log for all internal store stock changes
CREATE TABLE IF NOT EXISTS kitchen_store_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  branch_id         uuid NOT NULL REFERENCES branches(id),
  kitchen_store_item_id uuid NOT NULL REFERENCES kitchen_store_items(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  movement_type     text NOT NULL, -- 'received', 'returned_to_inventory', 'meal_prep', 'cancel_meal_prep'
  quantity_change   numeric(12,4) NOT NULL,
  quantity_before   numeric(12,4) NOT NULL DEFAULT 0,
  quantity_after    numeric(12,4) NOT NULL DEFAULT 0,
  reference_type    text,          -- 'ingredient_request', 'disbursement'
  reference_id      uuid,
  notes             text,
  performed_by      uuid NOT NULL REFERENCES profiles(id),
  performed_by_name text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_kitchen_store_items_branch
  ON kitchen_store_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_store_disbursements_branch
  ON kitchen_store_disbursements (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_store_disbursements_item
  ON kitchen_store_disbursements (kitchen_store_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_store_movements_branch
  ON kitchen_store_movements (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_store_movements_item
  ON kitchen_store_movements (kitchen_store_item_id, created_at DESC);

-- 5. RLS policies
ALTER TABLE kitchen_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_store_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_store_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitchen_store_items_company"
  ON kitchen_store_items FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "kitchen_store_disbursements_company"
  ON kitchen_store_disbursements FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "kitchen_store_movements_company"
  ON kitchen_store_movements FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
