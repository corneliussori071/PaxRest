-- ============================================================================
-- Migration: 00052_hr_payroll_module
-- Description: Create HR & Payroll module tables and enums
-- ============================================================================

-- ─── New Permission ─────────────────────────────────────────────────────────
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'manage_hr';

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'intern');
CREATE TYPE salary_type AS ENUM ('monthly', 'hourly', 'daily');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'half_day', 'on_leave');
CREATE TYPE payroll_status AS ENUM ('draft', 'approved', 'paid');
CREATE TYPE leave_approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE performance_record_type AS ENUM ('warning', 'complaint', 'commendation');

-- ─── Staff HR Profiles ──────────────────────────────────────────────────────
-- Extends profiles with HR-specific fields
CREATE TABLE staff_hr_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_code    text,                    -- e.g. STAFF-0001
  date_of_birth date,
  gender        gender_type,
  address       text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  employment_type  employment_type NOT NULL DEFAULT 'full_time',
  salary_type      salary_type NOT NULL DEFAULT 'monthly',
  base_pay         numeric(12,2) NOT NULL DEFAULT 0,
  allowances       numeric(12,2) NOT NULL DEFAULT 0,
  tax_percentage   numeric(5,2) NOT NULL DEFAULT 0,
  overtime_rate    numeric(12,2) NOT NULL DEFAULT 0,
  bank_account     text,
  hire_date        date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, company_id)
);

-- ─── HR Shifts (Scheduling) ────────────────────────────────────────────────
-- Separate from the financial shifts table (shifts = cash register sessions)
CREATE TABLE hr_shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  shift_name      text NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  max_staff       integer NOT NULL DEFAULT 5,
  break_duration  integer NOT NULL DEFAULT 0,  -- minutes
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Shift Assignments ─────────────────────────────────────────────────────
CREATE TABLE shift_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shift_id      uuid NOT NULL REFERENCES hr_shifts(id) ON DELETE CASCADE,
  assignment_date date NOT NULL,
  station       text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, shift_id, assignment_date)
);

-- ─── Attendance Records ─────────────────────────────────────────────────────
CREATE TABLE attendance_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shift_id        uuid REFERENCES hr_shifts(id) ON DELETE SET NULL,
  date            date NOT NULL,
  clock_in        timestamptz,
  clock_out       timestamptz,
  break_minutes   integer NOT NULL DEFAULT 0,
  total_hours     numeric(5,2),
  overtime_hours  numeric(5,2) NOT NULL DEFAULT 0,
  status          attendance_status NOT NULL DEFAULT 'present',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

-- ─── Payroll Records ────────────────────────────────────────────────────────
CREATE TABLE payroll_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  base_pay        numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay    numeric(12,2) NOT NULL DEFAULT 0,
  allowances      numeric(12,2) NOT NULL DEFAULT 0,
  deductions      numeric(12,2) NOT NULL DEFAULT 0,
  tax             numeric(12,2) NOT NULL DEFAULT 0,
  net_pay         numeric(12,2) NOT NULL DEFAULT 0,
  gross_pay       numeric(12,2) NOT NULL DEFAULT 0,
  status          payroll_status NOT NULL DEFAULT 'draft',
  approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Leave Types ────────────────────────────────────────────────────────────
CREATE TABLE leave_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  max_days        integer NOT NULL DEFAULT 0,
  is_paid         boolean NOT NULL DEFAULT true,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

-- ─── Leave Requests ─────────────────────────────────────────────────────────
CREATE TABLE leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  reason          text,
  status          leave_approval_status NOT NULL DEFAULT 'pending',
  reviewed_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Performance & Disciplinary Records ─────────────────────────────────────
CREATE TABLE performance_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  record_type     performance_record_type NOT NULL,
  title           text NOT NULL,
  description     text,
  recorded_by     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  record_date     date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_staff_hr_profiles_company ON staff_hr_profiles(company_id);
CREATE INDEX idx_staff_hr_profiles_profile ON staff_hr_profiles(profile_id);
CREATE INDEX idx_hr_shifts_company ON hr_shifts(company_id);
CREATE INDEX idx_shift_assignments_staff ON shift_assignments(staff_id);
CREATE INDEX idx_shift_assignments_date ON shift_assignments(assignment_date);
CREATE INDEX idx_attendance_records_staff ON attendance_records(staff_id);
CREATE INDEX idx_attendance_records_date ON attendance_records(date);
CREATE INDEX idx_payroll_records_staff ON payroll_records(staff_id);
CREATE INDEX idx_payroll_records_period ON payroll_records(period_start, period_end);
CREATE INDEX idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_performance_records_staff ON performance_records(staff_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE staff_hr_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_records ENABLE ROW LEVEL SECURITY;

-- RLS policies: all tables scoped to company_id via service-role (edge functions handle auth)
CREATE POLICY "Service role full access" ON staff_hr_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON hr_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON shift_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON payroll_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON leave_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON leave_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON performance_records FOR ALL USING (true) WITH CHECK (true);
