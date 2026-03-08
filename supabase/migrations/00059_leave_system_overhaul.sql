-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00059: Leave System Overhaul
-- Adds: leave_settings, leave_type_role_limits, pto_rates tables
-- Alters: leave_requests with adjusted dates + pto_hours_used
-- ═══════════════════════════════════════════════════════════════════════════

-- Per-company leave system configuration
CREATE TABLE IF NOT EXISTS leave_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_system    text NOT NULL DEFAULT 'fixed' CHECK (leave_system IN ('fixed', 'pto')),
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (company_id)
);

ALTER TABLE leave_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on leave_settings"
  ON leave_settings FOR ALL USING (true) WITH CHECK (true);

-- Per-leave-type, per-role maximum days (for Fixed Days Leave system)
CREATE TABLE IF NOT EXISTS leave_type_role_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  role            text NOT NULL,
  max_days        integer NOT NULL DEFAULT 0 CHECK (max_days >= 0),
  UNIQUE (company_id, leave_type_id, role)
);

ALTER TABLE leave_type_role_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on leave_type_role_limits"
  ON leave_type_role_limits FOR ALL USING (true) WITH CHECK (true);

-- PTO accrual rates per company per role (X worked hours = Y PTO hours)
CREATE TABLE IF NOT EXISTS pto_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role            text NOT NULL,
  worked_hours    numeric(8,2) NOT NULL DEFAULT 1 CHECK (worked_hours > 0),
  pto_hours       numeric(8,2) NOT NULL DEFAULT 1 CHECK (pto_hours > 0),
  UNIQUE (company_id, role)
);

ALTER TABLE pto_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pto_rates"
  ON pto_rates FOR ALL USING (true) WITH CHECK (true);

-- Extend leave_requests with HR-adjusted dates and PTO tracking
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS adjusted_start_date  date,
  ADD COLUMN IF NOT EXISTS adjusted_end_date    date,
  ADD COLUMN IF NOT EXISTS pto_hours_used       numeric(8,2);
