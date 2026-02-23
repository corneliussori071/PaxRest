-- ============================================================================
-- Migration: 00007_create_delivery_tables
-- Description: Delivery zones, riders, deliveries, delivery status history
-- ============================================================================

-- ─── Delivery Zones ─────────────────────────────────────────────────────────

CREATE TABLE delivery_zones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  min_order_amount numeric(10,2) NOT NULL DEFAULT 0,
  estimated_time_min int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  polygon jsonb, -- {coordinates: [[lat, lng], ...]}
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Riders ─────────────────────────────────────────────────────────────────

CREATE TABLE riders (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  name text NOT NULL,
  phone text NOT NULL,
  vehicle_type vehicle_type NOT NULL DEFAULT 'motorcycle',
  license_plate text,
  is_available boolean NOT NULL DEFAULT true,
  is_on_delivery boolean NOT NULL DEFAULT false,
  current_location jsonb, -- {lat, lng, updated_at}
  active_deliveries_count int NOT NULL DEFAULT 0,
  max_concurrent_deliveries int NOT NULL DEFAULT 3,
  total_deliveries int NOT NULL DEFAULT 0,
  average_rating numeric(3,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Deliveries ─────────────────────────────────────────────────────────────

CREATE TABLE deliveries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  order_number int NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  rider_id uuid REFERENCES riders(id),
  rider_name text,
  status delivery_status NOT NULL DEFAULT 'pending_assignment',
  assignment_type delivery_assignment_type NOT NULL DEFAULT 'manual',
  pickup_address text NOT NULL,
  delivery_address jsonb NOT NULL, -- CustomerAddress
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  delivery_zone_id uuid REFERENCES delivery_zones(id),
  estimated_pickup_time timestamptz,
  actual_pickup_time timestamptz,
  estimated_delivery_time timestamptz,
  actual_delivery_time timestamptz,
  distance_km numeric(8,2),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  notes text,
  proof_of_delivery_url text,
  rating int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Delivery Status History ────────────────────────────────────────────────

CREATE TABLE delivery_status_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  old_status delivery_status,
  new_status delivery_status NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_by_name text,
  location jsonb, -- {lat, lng, updated_at}
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
