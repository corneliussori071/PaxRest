-- ============================================================================
-- Migration: 00004_create_order_tables
-- Description: Orders, order items, order payments, order status history,
--              tables (dine-in management)
-- ============================================================================

-- ─── Tables (dine-in) ───────────────────────────────────────────────────────

CREATE TABLE tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 4,
  section text,
  status table_status NOT NULL DEFAULT 'available',
  current_order_id uuid, -- FK added after orders table
  is_active boolean NOT NULL DEFAULT true,
  position_x numeric(6,2),
  position_y numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, branch_id, table_number)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Orders ─────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_number serial, -- Auto-incrementing (global; branch-scoped numbering via sequence or app logic)
  order_type order_type NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  table_id uuid REFERENCES tables(id) ON DELETE SET NULL,
  customer_id uuid, -- FK added after customers table
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address jsonb, -- {street, city, state, zip, lat, lng, instructions}
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_reason text,
  tip_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  loyalty_points_used int NOT NULL DEFAULT 0,
  loyalty_discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes text,
  source order_source NOT NULL DEFAULT 'pos',
  shift_id uuid, -- FK added after shifts table
  created_by uuid REFERENCES profiles(id),
  created_by_name text,
  estimated_ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from tables to orders (circular reference)
ALTER TABLE tables
  ADD CONSTRAINT fk_tables_current_order
  FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- ─── Order Items ────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  menu_item_name text NOT NULL,
  variant_id uuid REFERENCES menu_variants(id),
  variant_name text,
  quantity int NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  modifiers jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{modifier_id, modifier_name, modifier_group_name, price}]
  modifiers_total numeric(10,2) NOT NULL DEFAULT 0,
  item_total numeric(12,2) NOT NULL DEFAULT 0,
  special_instructions text,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  status order_item_status NOT NULL DEFAULT 'pending',
  prepared_by uuid REFERENCES profiles(id),
  prepared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Order Payments ─────────────────────────────────────────────────────────

CREATE TABLE order_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  tip_amount numeric(12,2) NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  reference text, -- Mobile money ref, card last 4, etc.
  status payment_status NOT NULL DEFAULT 'pending',
  processed_by uuid REFERENCES profiles(id),
  processed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Order Status History ───────────────────────────────────────────────────

CREATE TABLE order_status_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status order_status,
  new_status order_status NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
