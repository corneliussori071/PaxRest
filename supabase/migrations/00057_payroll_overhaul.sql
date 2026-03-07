-- ============================================================================
-- 00057: Payroll Overhaul
--   - New payroll statuses: validated, pending_payout
--   - Payroll settings table (pay date, auto pay)
--   - Payroll adjustments table (direct debit/credit per staff)
--   - Column additions on payroll_records
-- ============================================================================

-- 1. Extend payroll_status enum with new values
ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'validated' AFTER 'approved';
ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'pending_payout' AFTER 'validated';

-- 2. Payroll settings per company (pay date, auto pay toggle)
CREATE TABLE IF NOT EXISTS payroll_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  pay_day     integer NOT NULL DEFAULT 25, -- day of month (1-28)
  auto_pay    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, branch_id)
);

-- 3. Payroll adjustments (HR credits/debits per staff per period)
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payroll_id    uuid REFERENCES payroll_records(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('credit', 'debit')),
  amount        numeric(12,2) NOT NULL DEFAULT 0,
  reason        text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 4. Add validated_by and validated_at columns on payroll_records
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS adjustments_total numeric(12,2) NOT NULL DEFAULT 0;
