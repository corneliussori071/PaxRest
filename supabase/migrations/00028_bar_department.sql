-- ============================================================================
-- Migration: 00028_bar_department
-- Description:
--   Bar Department — isolated stock tracking for the bar, mirroring the
--   kitchen internal store pattern. Bar staff request items from inventory,
--   receive them into an internal store, and sell directly from it.
--   Also adds 'awaiting_payment' order status and 'bar' order source,
--   plus department tracking on orders.
-- ============================================================================

-- 1. Add awaiting_payment to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_payment' AFTER 'served';

-- 2. Add 'bar' source
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'bar';

-- 3. Add department field to orders for tracking origin (kitchen, bar, pos)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'pos';

-- 4. Add served_at timestamp
ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at timestamptz;

-- 5. Bar Internal Store — one row per inventory item per branch
CREATE TABLE IF NOT EXISTS bar_store_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  branch_id    uuid NOT NULL REFERENCES branches(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  item_name    text NOT NULL,
  unit         text NOT NULL DEFAULT 'pcs',
  selling_price numeric(10,2) NOT NULL DEFAULT 0,
  barcode      text,
  quantity     numeric(12,4) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, inventory_item_id)
);

-- 6. Bar Internal Disbursements / Sales — tracks each sale from bar internal store
CREATE TABLE IF NOT EXISTS bar_store_sales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  branch_id         uuid NOT NULL REFERENCES branches(id),
  bar_store_item_id uuid NOT NULL REFERENCES bar_store_items(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  order_id          uuid REFERENCES orders(id) ON DELETE SET NULL,
  quantity          numeric(12,4) NOT NULL,
  unit              text NOT NULL DEFAULT 'pcs',
  sold_by           uuid NOT NULL REFERENCES profiles(id),
  sold_by_name      text NOT NULL,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES profiles(id),
  cancelled_by_name text,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 7. Bar Store Movements — audit log for all bar internal store stock changes
CREATE TABLE IF NOT EXISTS bar_store_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  branch_id         uuid NOT NULL REFERENCES branches(id),
  bar_store_item_id uuid NOT NULL REFERENCES bar_store_items(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  movement_type     text NOT NULL, -- 'received', 'returned_to_inventory', 'sale', 'cancel_sale'
  quantity_change   numeric(12,4) NOT NULL,
  quantity_before   numeric(12,4) NOT NULL DEFAULT 0,
  quantity_after    numeric(12,4) NOT NULL DEFAULT 0,
  reference_type    text,          -- 'ingredient_request', 'sale', 'order'
  reference_id      uuid,
  notes             text,
  performed_by      uuid NOT NULL REFERENCES profiles(id),
  performed_by_name text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 8. Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_bar_store_items_branch
  ON bar_store_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_bar_store_items_barcode
  ON bar_store_items (branch_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bar_store_sales_branch
  ON bar_store_sales (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bar_store_sales_order
  ON bar_store_sales (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bar_store_movements_branch
  ON bar_store_movements (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_department
  ON orders (branch_id, department, status);

-- 9. RLS policies
ALTER TABLE bar_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_store_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_store_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_store_items_company"
  ON bar_store_items FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "bar_store_sales_company"
  ON bar_store_sales FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "bar_store_movements_company"
  ON bar_store_movements FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
