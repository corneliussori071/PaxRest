-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  Migration 00055 – Schedule entity for grouping shift assignments  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE TABLE hr_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  station_id  uuid NOT NULL REFERENCES hr_stations(id) ON DELETE CASCADE,
  date_from   date NOT NULL,
  date_to     date NOT NULL,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_schedules_company ON hr_schedules(company_id);
CREATE INDEX idx_hr_schedules_station ON hr_schedules(station_id);

-- Link assignments to a schedule
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES hr_schedules(id) ON DELETE CASCADE;
CREATE INDEX idx_shift_assignments_schedule ON shift_assignments(schedule_id);

-- RLS
ALTER TABLE hr_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON hr_schedules FOR ALL USING (true) WITH CHECK (true);
