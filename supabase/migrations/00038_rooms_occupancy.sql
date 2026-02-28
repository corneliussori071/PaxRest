-- ============================================================================
-- Migration: 00038_rooms_occupancy
-- Description:
--   • Add current_occupants tracking to rooms (enables partial check-out)
--   • Add linked_room_id + linked_room_number to orders so an accommodation
--     order can be associated with a specific room (for display/querying),
--     separate from room-product line items.
-- ============================================================================

-- 1. Room occupancy counter
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS current_occupants integer NOT NULL DEFAULT 0;

-- 2. Link orders to rooms (optional association for accommodation context)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS linked_room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS linked_room_number text;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_occupancy
  ON rooms (branch_id, status, current_occupants);

CREATE INDEX IF NOT EXISTS idx_orders_linked_room
  ON orders (linked_room_id)
  WHERE linked_room_id IS NOT NULL;
