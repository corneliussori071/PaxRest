-- Add fields to meal_assignments for Make-a-Dish flow enhancements
ALTER TABLE meal_assignments
  ADD COLUMN IF NOT EXISTS expected_completion_time timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_ingredients jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS excluded_extras     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rejection_reason    text;
