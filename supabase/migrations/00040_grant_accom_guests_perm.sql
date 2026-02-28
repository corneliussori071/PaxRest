-- ============================================================================
-- Migration: 00040_guest_bookings_table
-- Description:
--   Step 2 of 2: Create guest_bookings table and grant accom_guests to owners.
--   Runs after 00039 so the permission enum value is already committed.
-- ============================================================================

-- 1. Guest bookings table
CREATE TABLE IF NOT EXISTS guest_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  branch_id           uuid NOT NULL REFERENCES branches(id),

  -- Room reference
  room_id             uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  room_number         text NOT NULL,

  -- Order reference (the original room-product order)
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_number        text,

  -- Guest info
  customer_name       text,
  num_occupants       integer NOT NULL DEFAULT 1,

  -- Scheduled dates (from booking_details set during order creation)
  scheduled_check_in  timestamptz,
  scheduled_check_out timestamptz,
  duration_count      integer,
  duration_unit       text,                    -- night, day, hour

  -- Actual dates (filled in by staff at check-in / departure)
  actual_check_in     timestamptz,
  actual_check_out    timestamptz,

  -- Lifecycle status
  status              text NOT NULL DEFAULT 'pending_checkin',
                                               -- pending_checkin | checked_in | departed

  notes               text,

  -- Check-in audit
  checked_in_by       uuid REFERENCES profiles(id),
  checked_in_by_name  text,
  checked_in_at       timestamptz,

  -- Departure audit
  departed_by         uuid REFERENCES profiles(id),
  departed_by_name    text,
  departed_at         timestamptz,

  -- Transfer history JSON array of {from_room_id, from_room_number, to_room_id, to_room_number, transferred_by_name, at}
  transfer_history    jsonb DEFAULT '[]'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_guest_bookings_branch
  ON guest_bookings (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_guest_bookings_room
  ON guest_bookings (room_id, status);

CREATE INDEX IF NOT EXISTS idx_guest_bookings_order
  ON guest_bookings (order_id);

CREATE INDEX IF NOT EXISTS idx_guest_bookings_checkin
  ON guest_bookings (branch_id, scheduled_check_in)
  WHERE status = 'pending_checkin';

-- 3. Grant accom_guests to all owner profiles
UPDATE profiles
  SET permissions = array_append(permissions, 'accom_guests'::permission_type)
WHERE role = 'owner'
  AND NOT ('accom_guests'::permission_type = ANY(permissions));
