-- ============================================================================
-- Migration: 00043_delivery_overhaul
-- Description: Fix delivery tables for full workflow integration
-- ============================================================================

-- ─── Fix delivery_zones: rename estimated_time_min → estimated_minutes ──────
ALTER TABLE delivery_zones
  RENAME COLUMN estimated_time_min TO estimated_minutes;

-- ─── Fix deliveries: relax NOT NULL on columns we can't always populate ─────
ALTER TABLE deliveries ALTER COLUMN delivery_address DROP NOT NULL;
ALTER TABLE deliveries ALTER COLUMN pickup_address DROP NOT NULL;
ALTER TABLE deliveries ALTER COLUMN pickup_address SET DEFAULT '';
ALTER TABLE deliveries ALTER COLUMN customer_phone DROP NOT NULL;
ALTER TABLE deliveries ALTER COLUMN customer_phone SET DEFAULT '';

-- ─── Add missing columns to deliveries ──────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS rider_response text NOT NULL DEFAULT 'pending'
    CHECK (rider_response IN ('pending', 'accepted', 'declined'));

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- ─── Auto-manage riders table from profiles ──────────────────────────────────
-- When a profile is assigned role='rider', a riders record is auto-created.
-- When role changes away from 'rider', rider is marked inactive.
CREATE OR REPLACE FUNCTION sync_rider_from_profile()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'rider' THEN
    -- Ensure a rider record exists
    INSERT INTO riders (id, company_id, branch_id, name, phone, is_active)
    VALUES (
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.active_branch_id, (
        SELECT id FROM branches WHERE company_id = NEW.company_id LIMIT 1
      )),
      NEW.name,
      COALESCE(NEW.phone, ''),
      true
    )
    ON CONFLICT (id) DO UPDATE
      SET name     = EXCLUDED.name,
          phone    = COALESCE(EXCLUDED.phone, riders.phone),
          is_active = true,
          updated_at = now();
  ELSIF OLD.role = 'rider' AND NEW.role <> 'rider' THEN
    -- Deactivate the rider record
    UPDATE riders SET is_active = false, updated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rider_from_profile ON profiles;
CREATE TRIGGER trg_sync_rider_from_profile
  AFTER INSERT OR UPDATE OF role, name, phone ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_rider_from_profile();

-- Back-fill riders for any existing profiles already assigned role='rider'
INSERT INTO riders (id, company_id, branch_id, name, phone, is_active)
SELECT
  p.id,
  p.company_id,
  COALESCE(p.active_branch_id, (SELECT id FROM branches WHERE company_id = p.company_id LIMIT 1)),
  p.name,
  COALESCE(p.phone, ''),
  true
FROM profiles p
WHERE p.role = 'rider'
  AND p.company_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      phone = COALESCE(EXCLUDED.phone, riders.phone),
      is_active = true,
      updated_at = now();

NOTIFY pgrst, 'reload schema';
