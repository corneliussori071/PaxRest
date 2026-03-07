-- ============================================================================
-- Migration: 00053_hr_profile_enhancements
-- Description: Add payout method, employment end date, hourly rate, retirement date
-- ============================================================================

-- New columns on staff_hr_profiles
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS employment_end_date date;
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS retirement_date date;
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS payout_method text NOT NULL DEFAULT 'cash';  -- cash | bank | mobile_money
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE staff_hr_profiles ADD COLUMN IF NOT EXISTS account_type text;  -- savings | current / checking
