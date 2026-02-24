-- ============================================================================
-- Migration: 00015_kitchen_inventory_overhaul
-- Description: Adds kitchen workflow, inventory enhancements (barcode,
--              packaging, weight), menu extras, meal assignments,
--              ingredient requests, and availability tracking.
-- ============================================================================

-- ─── New Enums ──────────────────────────────────────────────────────────────

CREATE TYPE packaging_type AS ENUM ('single', 'pack');

CREATE TYPE weight_unit AS ENUM ('kg', 'g', 'lb', 'oz');

CREATE TYPE meal_availability AS ENUM ('available', 'low', 'sold_out');

CREATE TYPE meal_assignment_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'rejected');

CREATE TYPE ingredient_request_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled');

-- ─── Extend order_source enum with 'kitchen' ────────────────────────────────

ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'kitchen';

-- ─── Extend inventory_items ─────────────────────────────────────────────────

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS packaging_type packaging_type NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS items_per_pack int DEFAULT 1 CHECK (items_per_pack >= 1),
  ADD COLUMN IF NOT EXISTS cost_per_item numeric(10,4) DEFAULT 0 CHECK (cost_per_item >= 0),
  ADD COLUMN IF NOT EXISTS selling_price numeric(10,2) DEFAULT 0 CHECK (selling_price >= 0),
  ADD COLUMN IF NOT EXISTS weight_value numeric(10,4),
  ADD COLUMN IF NOT EXISTS weight_unit weight_unit;

-- Unique barcode per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_barcode
  ON inventory_items (company_id, branch_id, barcode) WHERE barcode IS NOT NULL;

-- ─── Extend menu_items with availability and media ──────────────────────────

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS availability_status meal_availability NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text CHECK (media_type IN ('image', 'video'));

-- ─── Menu Item Extras ───────────────────────────────────────────────────────
-- Extras are add-ons customers can choose (e.g., extra cheese, avocado).
-- Separate from modifiers: extras add to price; removing ingredients reduces price.

CREATE TABLE menu_item_extras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_item_extras_item ON menu_item_extras (menu_item_id);

-- ─── Extend menu_item_ingredients with cost_per_unit ────────────────────────
-- Used for customer price deduction when removing an ingredient.

ALTER TABLE menu_item_ingredients
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS cost_contribution numeric(10,2) NOT NULL DEFAULT 0;

-- ─── Meal Assignments ───────────────────────────────────────────────────────
-- When a chef clicks "Make a Dish", an internal assignment is created.
-- The kitchen manager or system assigns dishes to specific chefs.

CREATE TABLE meal_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  menu_item_name text NOT NULL,
  assigned_to uuid REFERENCES profiles(id),
  assigned_to_name text,
  assigned_by uuid REFERENCES profiles(id),
  assigned_by_name text,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  quantity_completed int NOT NULL DEFAULT 0 CHECK (quantity_completed >= 0),
  status meal_assignment_status NOT NULL DEFAULT 'pending',
  notes text,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON meal_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_meal_assignments_branch ON meal_assignments (company_id, branch_id, created_at DESC);
CREATE INDEX idx_meal_assignments_assigned_to ON meal_assignments (assigned_to, status) WHERE status NOT IN ('completed', 'rejected');
CREATE INDEX idx_meal_assignments_status ON meal_assignments (branch_id, status);
CREATE INDEX idx_meal_assignments_item ON meal_assignments (menu_item_id);

-- ─── Ingredient Requests ────────────────────────────────────────────────────
-- Kitchen staff can request ingredients from inventory when they run low.

CREATE TABLE ingredient_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  requested_by uuid NOT NULL REFERENCES profiles(id),
  requested_by_name text NOT NULL,
  approved_by uuid REFERENCES profiles(id),
  approved_by_name text,
  status ingredient_request_status NOT NULL DEFAULT 'pending',
  notes text,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ingredient_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE ingredient_request_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES ingredient_requests(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  inventory_item_name text NOT NULL,
  quantity_requested numeric(12,4) NOT NULL CHECK (quantity_requested > 0),
  quantity_approved numeric(12,4),
  unit inventory_unit NOT NULL
);

CREATE INDEX idx_ingredient_requests_branch ON ingredient_requests (company_id, branch_id, created_at DESC);
CREATE INDEX idx_ingredient_requests_status ON ingredient_requests (branch_id, status) WHERE status = 'pending';
CREATE INDEX idx_ingredient_request_items_request ON ingredient_request_items (request_id);

-- ─── Extend order_items with removed_ingredients and extras ─────────────────
-- Tracks customer customization for ingredient removal and extras.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS removed_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extras_total numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingredients_discount numeric(10,2) NOT NULL DEFAULT 0;

-- ─── Available Meals Tracking ───────────────────────────────────────────────
-- When a chef completes a dish via "Make a Dish", it becomes an available meal.
-- POS can sell these directly without waiting for kitchen preparation.

CREATE TABLE available_meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  menu_item_name text NOT NULL,
  quantity_available int NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  prepared_by uuid REFERENCES profiles(id),
  prepared_by_name text,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, menu_item_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON available_meals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_available_meals_branch ON available_meals (company_id, branch_id);
CREATE INDEX idx_available_meals_item ON available_meals (menu_item_id);

-- ─── RLS Policies for new tables ────────────────────────────────────────────

ALTER TABLE menu_item_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE available_meals ENABLE ROW LEVEL SECURITY;

-- menu_item_extras: company-scoped read, manage_menu for write
CREATE POLICY "Company members read menu extras"
  ON menu_item_extras FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM menu_items mi
      WHERE mi.id = menu_item_extras.menu_item_id
        AND mi.company_id = auth_company_id()
    )
  );

CREATE POLICY "Manage menu extras"
  ON menu_item_extras FOR ALL
  USING (
    has_permission('manage_menu')
    AND EXISTS (
      SELECT 1 FROM menu_items mi
      WHERE mi.id = menu_item_extras.menu_item_id
        AND mi.company_id = auth_company_id()
    )
  );

-- meal_assignments: company-scoped
CREATE POLICY "Company read meal assignments"
  ON meal_assignments FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "Kitchen staff manage assignments"
  ON meal_assignments FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_permission('view_kitchen') OR has_permission('manage_menu'))
  );

-- ingredient_requests: company-scoped
CREATE POLICY "Company read ingredient requests"
  ON ingredient_requests FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "Kitchen staff create requests"
  ON ingredient_requests FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND has_permission('view_kitchen')
  );

CREATE POLICY "Inventory staff manage requests"
  ON ingredient_requests FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND has_permission('manage_inventory')
  );

CREATE POLICY "Company read request items"
  ON ingredient_request_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ingredient_requests ir
      WHERE ir.id = ingredient_request_items.request_id
        AND ir.company_id = auth_company_id()
    )
  );

CREATE POLICY "Staff manage request items"
  ON ingredient_request_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ingredient_requests ir
      WHERE ir.id = ingredient_request_items.request_id
        AND ir.company_id = auth_company_id()
    )
  );

-- available_meals: company-scoped read, kitchen write
CREATE POLICY "Company read available meals"
  ON available_meals FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "Kitchen staff manage available meals"
  ON available_meals FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_permission('view_kitchen') OR has_permission('manage_menu'))
  );

-- ─── Public access policy for menu_items (customer app) ─────────────────────
-- Customers need to read menu items without authentication.

CREATE POLICY "Public read active menu items"
  ON menu_items FOR SELECT
  USING (is_active = true AND is_available = true);

CREATE POLICY "Public read active categories"
  ON menu_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read active variants"
  ON menu_variants FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read active modifiers"
  ON modifiers FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read modifier groups"
  ON modifier_groups FOR SELECT
  USING (is_active = true);

-- Public read for menu_item_extras (customer app)
CREATE POLICY "Public read available extras"
  ON menu_item_extras FOR SELECT
  USING (is_available = true);

-- Public read for menu_item_ingredients (customer app - to show removable ingredients)
CREATE POLICY "Public read item ingredients"
  ON menu_item_ingredients FOR SELECT
  USING (true);

-- Public read for available_meals (customer app - availability awareness)
CREATE POLICY "Public read available meals"
  ON available_meals FOR SELECT
  USING (true);

-- ─── Enable Realtime for new tables ─────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE meal_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE available_meals;
ALTER PUBLICATION supabase_realtime ADD TABLE ingredient_requests;

-- ─── Update menu-images bucket size limit to 15MB ───────────────────────────

UPDATE storage.buckets
SET file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
WHERE id = 'menu-images';

-- ─── Create CSV upload bucket ───────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('csv-uploads', 'csv-uploads', false, 10485760, ARRAY['text/csv', 'application/vnd.ms-excel'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth upload csv"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'csv-uploads'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth read own csv"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'csv-uploads'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth delete csv"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'csv-uploads'
    AND auth.role() = 'authenticated'
  );
