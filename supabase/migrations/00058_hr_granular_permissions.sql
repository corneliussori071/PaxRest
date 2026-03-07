-- Add granular HR & Payroll permission types
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_staff';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_staff_view';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_attendance';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_attendance_view';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_shifts';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_shifts_view';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_payroll';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_payroll_view';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_leave';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_leave_view';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'hr_performance';
