-- ============================================================================
-- Migration: 00008_create_loyalty_notification_tables
-- Description: Loyalty programs, customers, loyalty transactions,
--              notifications, audit logs, file references
-- ============================================================================

-- ─── Loyalty Programs ───────────────────────────────────────────────────────

CREATE TABLE loyalty_programs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Rewards Program',
  points_per_currency_unit numeric(6,2) NOT NULL DEFAULT 1, -- 1 point per $1
  redemption_rate numeric(6,2) NOT NULL DEFAULT 100, -- 100 points = $1
  min_redeem_points int NOT NULL DEFAULT 100,
  welcome_bonus_points int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Customers (CRM + Loyalty) ─────────────────────────────────────────────

CREATE TABLE customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text NOT NULL,
  loyalty_points_balance int NOT NULL DEFAULT 0 CHECK (loyalty_points_balance >= 0),
  total_points_earned int NOT NULL DEFAULT 0,
  total_points_redeemed int NOT NULL DEFAULT 0,
  total_orders int NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from orders to customers
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ─── Loyalty Transactions (Immutable Ledger) ────────────────────────────────

CREATE TABLE loyalty_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_id uuid REFERENCES orders(id),
  type loyalty_txn_type NOT NULL,
  points int NOT NULL, -- Positive for earn, negative for redeem
  balance_after int NOT NULL,
  description text NOT NULL,
  performed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent modification of loyalty transactions
CREATE TRIGGER loyalty_transactions_immutable
  BEFORE UPDATE OR DELETE ON loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- ─── Notifications ──────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  branch_id uuid REFERENCES branches(id),
  type notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Audit Logs (Trigger-populated, Immutable) ─────────────────────────────

CREATE TABLE audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid,
  branch_id uuid,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action audit_action NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  performed_by uuid,
  performed_by_name text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent modification of audit logs
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();

-- ─── File References ────────────────────────────────────────────────────────

CREATE TABLE file_references (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size int NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
