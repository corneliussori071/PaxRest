-- ============================================================================
-- Migration: 00034_accommodation_department
-- Description:
--   Accommodation Department — rooms management, bookings, and internal store.
--   Supports room creation with categories (VIP/Express/Luxury/Regular/Custom),
--   cost per duration (night/day/hour), benefits, media uploads.
--   Mirrors the bar internal store pattern for item requisitions.
--   Also adds 'accommodation' order source/department and permission enums.
-- ============================================================================

-- 1. Add 'accommodation' source
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'accommodation';

-- 2. Add 'accommodation' station
ALTER TYPE kitchen_station ADD VALUE IF NOT EXISTS 'accommodation';

-- 3. Accommodation permission enums
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'view_accommodation';

COMMIT;
BEGIN;

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_create_order';

COMMIT;
BEGIN;

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_pending_orders';

COMMIT;
BEGIN;

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_pending_payment';

COMMIT;
BEGIN;

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_create_rooms';

COMMIT;
BEGIN;

ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'accom_request_items';

COMMIT;
BEGIN;

-- 4. Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  branch_id        uuid NOT NULL REFERENCES branches(id),
  room_number      text NOT NULL,
  floor_section    text,
  max_occupants    integer NOT NULL DEFAULT 1,
  category         text NOT NULL DEFAULT 'regular',  -- VIP, Express, Luxury, Regular, or custom text
  cost_amount      numeric(10,2) NOT NULL DEFAULT 0,
  cost_duration    text NOT NULL DEFAULT 'night',     -- night, day, hour
  benefits         jsonb DEFAULT '[]'::jsonb,         -- e.g. ["Free WiFi", "Free Meal"]
  media_url        text,
  media_type       text,                              -- 'image' or 'video'
  status           text NOT NULL DEFAULT 'available', -- available, occupied, maintenance, reserved
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES profiles(id),
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, room_number)
);

-- 5. Room benefits lookup (optional, for standardized benefits)
CREATE TABLE IF NOT EXISTS room_benefits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  name         text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

-- 6. Accommodation Internal Store — one row per inventory item per branch
CREATE TABLE IF NOT EXISTS accom_store_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  branch_id         uuid NOT NULL REFERENCES branches(id),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  item_name         text NOT NULL,
  unit              text NOT NULL DEFAULT 'pcs',
  selling_price     numeric(10,2) NOT NULL DEFAULT 0,
  barcode           text,
  quantity          numeric(12,4) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, inventory_item_id)
);

-- 7. Accommodation Store Sales
CREATE TABLE IF NOT EXISTS accom_store_sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  branch_id           uuid NOT NULL REFERENCES branches(id),
  accom_store_item_id uuid NOT NULL REFERENCES accom_store_items(id),
  inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
  order_id            uuid REFERENCES orders(id) ON DELETE SET NULL,
  quantity            numeric(12,4) NOT NULL,
  unit                text NOT NULL DEFAULT 'pcs',
  sold_by             uuid NOT NULL REFERENCES profiles(id),
  sold_by_name        text NOT NULL,
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES profiles(id),
  cancelled_by_name   text,
  cancel_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 8. Accommodation Store Movements
CREATE TABLE IF NOT EXISTS accom_store_movements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  branch_id           uuid NOT NULL REFERENCES branches(id),
  accom_store_item_id uuid NOT NULL REFERENCES accom_store_items(id),
  inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
  movement_type       text NOT NULL,
  quantity_change     numeric(12,4) NOT NULL,
  quantity_before     numeric(12,4) NOT NULL DEFAULT 0,
  quantity_after      numeric(12,4) NOT NULL DEFAULT 0,
  reference_type      text,
  reference_id        uuid,
  notes               text,
  performed_by        uuid NOT NULL REFERENCES profiles(id),
  performed_by_name   text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_branch ON rooms (branch_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_room_benefits_company ON room_benefits (company_id);
CREATE INDEX IF NOT EXISTS idx_accom_store_items_branch ON accom_store_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_accom_store_items_barcode ON accom_store_items (branch_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accom_store_sales_branch ON accom_store_sales (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accom_store_sales_order ON accom_store_sales (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accom_store_movements_branch ON accom_store_movements (branch_id, created_at DESC);

-- 10. RLS policies
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE accom_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accom_store_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE accom_store_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_company"
  ON rooms FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "room_benefits_company"
  ON room_benefits FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "accom_store_items_company"
  ON accom_store_items FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "accom_store_sales_company"
  ON accom_store_sales FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "accom_store_movements_company"
  ON accom_store_movements FOR ALL
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- 11. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
