-- ============================================================================
-- Migration: 00045_other_services
-- Description:
--   Other Services — allows hotels/restaurants to list miscellaneous services
--   (hot tub bath, swimming pool, scenery, etc.) that are not rooms, bar, or menu.
--   Services can be added to cart during order creation and charged per duration.
-- ============================================================================

-- 1. Add permission enums for other_services
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'manage_other_services';

-- 2. Other Services table
CREATE TABLE IF NOT EXISTS other_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  branch_id        uuid NOT NULL REFERENCES branches(id),
  name             text NOT NULL,
  description      text,
  charge_amount    numeric(10,2) NOT NULL DEFAULT 0,
  charge_duration  text NOT NULL DEFAULT 'once',   -- once, hourly, daily, weekly, monthly, per_session
  media_url        text,
  media_type       text,                            -- 'image' or 'video'
  is_available     boolean NOT NULL DEFAULT true,
  is_active        boolean NOT NULL DEFAULT true,   -- soft-delete flag
  created_by       uuid REFERENCES profiles(id),
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_other_services_branch ON other_services (branch_id);
CREATE INDEX IF NOT EXISTS idx_other_services_available ON other_services (branch_id, is_available) WHERE is_active = true;

-- 4. RLS policies
ALTER TABLE other_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'other_services'
      AND policyname = 'Company members can view other_services'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can view other_services"
        ON other_services FOR SELECT
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
    WHERE schemaname = 'public' AND tablename = 'other_services'
      AND policyname = 'Company members can insert other_services'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can insert other_services"
        ON other_services FOR INSERT
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
    WHERE schemaname = 'public' AND tablename = 'other_services'
      AND policyname = 'Company members can update other_services'
  ) THEN
    EXECUTE '
      CREATE POLICY "Company members can update other_services"
        ON other_services FOR UPDATE
        USING (
          company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
          )
        )';
  END IF;
END $$;

-- 5. Grant manage_other_services to owners
-- NOTE: moved to 00046 because ALTER TYPE ADD VALUE cannot be used in the same
-- transaction as statements that reference the new enum value.
