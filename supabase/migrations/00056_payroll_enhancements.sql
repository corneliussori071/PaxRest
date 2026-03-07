-- ============================================================================
-- Migration: 00056_payroll_enhancements
-- Description: Add payroll suspension, worked-hours detail, and pending pay
-- ============================================================================

-- Track whether a staff member is suspended from payroll
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS payroll_suspended boolean NOT NULL DEFAULT false;

-- Extra breakdown columns on payroll_records
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_worked_hours numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_leave_hours  numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_break_hours  numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS days_worked        integer NOT NULL DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS days_off           integer NOT NULL DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS days_leave         integer NOT NULL DEFAULT 0;
