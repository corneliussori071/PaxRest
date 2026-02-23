-- ============================================================================
-- Migration: 00005_create_inventory_tables
-- Description: Inventory items, stock movements (ledger), wastage records,
--              inventory transfers, suppliers, purchase orders
-- ============================================================================

-- ─── Inventory Items ────────────────────────────────────────────────────────

CREATE TABLE inventory_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  unit inventory_unit NOT NULL DEFAULT 'pcs',
  quantity numeric(12,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock_level numeric(12,4) NOT NULL DEFAULT 0,
  cost_per_unit numeric(10,4) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  image_url text,
  category text,
  storage_location text,
  is_active boolean NOT NULL DEFAULT true,
  last_restock_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add deferred FK from menu_item_ingredients to inventory_items
ALTER TABLE menu_item_ingredients
  ADD CONSTRAINT fk_menu_item_ingredients_ingredient
  FOREIGN KEY (ingredient_id) REFERENCES inventory_items(id) ON DELETE CASCADE;

-- ─── Stock Movements (Immutable Ledger) ─────────────────────────────────────
-- Every single stock change is recorded here. INSERT only — no UPDATE/DELETE.

CREATE TABLE stock_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  movement_type stock_movement_type NOT NULL,
  quantity_change numeric(12,4) NOT NULL, -- Positive for additions, negative for deductions
  quantity_before numeric(12,4) NOT NULL,
  quantity_after numeric(12,4) NOT NULL,
  unit_cost numeric(10,4) NOT NULL DEFAULT 0,
  reference_type text, -- 'order', 'wastage', 'purchase', 'transfer', 'adjustment'
  reference_id uuid,
  notes text,
  performed_by uuid REFERENCES profiles(id),
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent updates and deletes on stock_movements
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Ledger records cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- ─── Wastage Records ────────────────────────────────────────────────────────

CREATE TABLE wastage_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  inventory_item_name text NOT NULL,
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit inventory_unit NOT NULL,
  unit_cost numeric(10,4) NOT NULL DEFAULT 0,
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  wastage_type wastage_type NOT NULL,
  recorded_by uuid NOT NULL REFERENCES profiles(id),
  recorded_by_name text NOT NULL,
  approved_by uuid REFERENCES profiles(id),
  approved_by_name text,
  image_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Inventory Transfers ────────────────────────────────────────────────────

CREATE TABLE inventory_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  from_branch_id uuid NOT NULL REFERENCES branches(id),
  from_branch_name text NOT NULL,
  to_branch_id uuid NOT NULL REFERENCES branches(id),
  to_branch_name text NOT NULL,
  status transfer_status NOT NULL DEFAULT 'pending',
  initiated_by uuid NOT NULL REFERENCES profiles(id),
  initiated_by_name text NOT NULL,
  received_by uuid REFERENCES profiles(id),
  received_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_branch_id != to_branch_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE inventory_transfer_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  inventory_item_name text NOT NULL,
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit inventory_unit NOT NULL,
  unit_cost numeric(10,4) NOT NULL DEFAULT 0
);

-- ─── Suppliers ──────────────────────────────────────────────────────────────

CREATE TABLE suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  payment_terms text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Purchase Orders ────────────────────────────────────────────────────────

CREATE TABLE purchase_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  order_number text NOT NULL,
  status purchase_order_status NOT NULL DEFAULT 'draft',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  invoice_url text,
  ordered_by uuid NOT NULL REFERENCES profiles(id),
  ordered_by_name text NOT NULL,
  received_by uuid REFERENCES profiles(id),
  received_by_name text,
  expected_date date,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE purchase_order_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  inventory_item_name text NOT NULL,
  quantity_ordered numeric(12,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(12,4) NOT NULL DEFAULT 0,
  unit inventory_unit NOT NULL,
  unit_cost numeric(10,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost numeric(12,2) NOT NULL DEFAULT 0
);
