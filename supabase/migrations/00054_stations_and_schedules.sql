-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  Migration 00054 – Stations & Schedule enhancements                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Stations table
CREATE TABLE hr_stations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  station_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_stations_company ON hr_stations(company_id);

-- Station staff (many-to-many)
CREATE TABLE hr_station_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  uuid NOT NULL REFERENCES hr_stations(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(station_id, staff_id)
);
CREATE INDEX idx_hr_station_staff_station ON hr_station_staff(station_id);

-- Add station_id column to shift_assignments for schedule association
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES hr_stations(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE hr_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_station_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON hr_stations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON hr_station_staff FOR ALL USING (true) WITH CHECK (true);
