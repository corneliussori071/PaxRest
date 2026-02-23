-- ============================================================================
-- Migration: 00006_create_financial_tables
-- Description: Shifts, cash drawer logs (immutable), order FK to shifts
-- ============================================================================

-- ─── Shifts ─────────────────────────────────────────────────────────────────

CREATE TABLE shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  opened_by uuid NOT NULL REFERENCES profiles(id),
  opened_by_name text NOT NULL,
  closed_by uuid REFERENCES profiles(id),
  closed_by_name text,
  status shift_status NOT NULL DEFAULT 'open',
  opening_cash numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_cash numeric(12,2),
  expected_cash numeric(12,2),
  cash_difference numeric(12,2),
  total_sales numeric(12,2) NOT NULL DEFAULT 0,
  total_orders int NOT NULL DEFAULT 0,
  sales_by_payment jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK from orders to shifts
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_shift
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

-- ─── Cash Drawer Logs (Immutable) ───────────────────────────────────────────
-- INSERT only — no UPDATE or DELETE allowed.

CREATE TABLE cash_drawer_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES shifts(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  action cash_drawer_action NOT NULL,
  amount numeric(12,2) NOT NULL,
  running_total numeric(12,2) NOT NULL,
  reason text,
  performed_by uuid NOT NULL REFERENCES profiles(id),
  performed_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent modification of cash drawer logs
CREATE TRIGGER cash_drawer_logs_immutable
  BEFORE UPDATE OR DELETE ON cash_drawer_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();
