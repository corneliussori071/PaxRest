-- ============================================================================
-- Migration: 00047_service_bookings
-- Description:
--   Service Bookings — tracks customer usage of "Other Services" (swimming pool,
--   hot tub, scenery tour, etc.) similar to how guest_bookings tracks room stays.
--   Supports start, in-use with countdown, extend, and end flows.
-- ============================================================================

-- 1. Service bookings table
CREATE TABLE IF NOT EXISTS service_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  branch_id           uuid NOT NULL REFERENCES branches(id),

  -- Service reference
  service_id          uuid NOT NULL REFERENCES other_services(id) ON DELETE RESTRICT,
  service_name        text NOT NULL,

  -- Order reference (the original order containing this service)
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_number        text,

  -- Customer info
  customer_name       text,

  -- Scheduled dates (from booking_details set during order creation)
  scheduled_start     timestamptz,
  scheduled_end       timestamptz,
  duration_count      integer,
  duration_unit       text,                    -- hourly, daily, weekly, monthly, per_session, once
  unit_price          numeric(10,2) NOT NULL DEFAULT 0,

  -- Actual dates (filled in by staff at start / end)
  actual_start        timestamptz,
  actual_end          timestamptz,

  -- Lifecycle status
  status              text NOT NULL DEFAULT 'pending_start',
                                               -- pending_start | in_use | ended

  notes               text,

  -- Start audit
  started_by          uuid REFERENCES profiles(id),
  started_by_name     text,
  started_at          timestamptz,

  -- End audit
  ended_by            uuid REFERENCES profiles(id),
  ended_by_name       text,
  ended_at            timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_service_bookings_branch
  ON service_bookings (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_service_bookings_service
  ON service_bookings (service_id, status);

CREATE INDEX IF NOT EXISTS idx_service_bookings_order
  ON service_bookings (order_id);

CREATE INDEX IF NOT EXISTS idx_service_bookings_pending
  ON service_bookings (branch_id, scheduled_start)
  WHERE status = 'pending_start';

-- 3. RLS policies
ALTER TABLE service_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_bookings'
      AND policyname = 'Company members can view service_bookings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can view service_bookings"
        ON service_bookings FOR SELECT
        USING (
          company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
          )
        )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_bookings'
      AND policyname = 'Company members can insert service_bookings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can insert service_bookings"
        ON service_bookings FOR INSERT
        WITH CHECK (
          company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
          )
        )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_bookings'
      AND policyname = 'Company members can update service_bookings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can update service_bookings"
        ON service_bookings FOR UPDATE
        USING (
          company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
          )
        )';
  END IF;
END $$;
