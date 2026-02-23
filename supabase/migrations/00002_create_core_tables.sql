-- ============================================================================
-- Migration: 00002_create_core_tables
-- Description: Companies, branches, profiles, invitations, sys_admins,
--              subscriptions, coupons, platform config
-- ============================================================================

-- ─── Companies ──────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  country text NOT NULL DEFAULT 'US',
  currency text NOT NULL DEFAULT 'USD',
  logo_url text,
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  subscription_expires_at timestamptz,
  max_branches int NOT NULL DEFAULT 1,
  max_staff int NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Branches ───────────────────────────────────────────────────────────────

CREATE TABLE branches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  location text NOT NULL,
  address text,
  phone text,
  email text,
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);

-- ─── Profiles (extends auth.users) ─────────────────────────────────────────

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  branch_ids uuid[] NOT NULL DEFAULT '{}',
  active_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role company_role NOT NULL DEFAULT 'custom',
  permissions permission_type[] NOT NULL DEFAULT '{}',
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Invitations ────────────────────────────────────────────────────────────

CREATE TABLE invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  email text NOT NULL,
  role company_role NOT NULL,
  permissions permission_type[] NOT NULL DEFAULT '{}',
  invited_by uuid NOT NULL REFERENCES profiles(id),
  invited_by_name text NOT NULL,
  company_name text NOT NULL,
  branch_name text,
  status invitation_status NOT NULL DEFAULT 'pending',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── System Admins ──────────────────────────────────────────────────────────

CREATE TABLE sys_admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role sys_admin_role NOT NULL DEFAULT 'admin',
  permissions sys_admin_permission[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Subscription Packages ──────────────────────────────────────────────────

CREATE TABLE subscription_packages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tier subscription_tier NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  yearly_price numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  features text[] NOT NULL DEFAULT '{}',
  max_branches int NOT NULL DEFAULT 1,
  max_staff int NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Subscription Payments ──────────────────────────────────────────────────

CREATE TABLE subscription_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  package_id uuid NOT NULL REFERENCES subscription_packages(id),
  billing_cycle billing_cycle NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  coupon_id uuid,
  coupon_code text,
  discount_amount numeric(10,2) DEFAULT 0,
  stripe_session_id text,
  stripe_payment_id text,
  status subscription_payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Coupons ────────────────────────────────────────────────────────────────

CREATE TABLE coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_type discount_type NOT NULL,
  discount_value numeric(10,2) NOT NULL,
  currency text,
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NOT NULL,
  applicable_tiers subscription_tier[],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES sys_admins(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES sys_admins(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Coupon Redemptions ─────────────────────────────────────────────────────

CREATE TABLE coupon_redemptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES coupons(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  payment_id uuid REFERENCES subscription_payments(id),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Platform Config ────────────────────────────────────────────────────────

CREATE TABLE platform_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES sys_admins(id)
);

-- Insert default platform config
INSERT INTO platform_config (key, value) VALUES
  ('maintenance', '{"enabled": false, "message": ""}'::jsonb),
  ('free_trial', '{"enabled": true, "duration_days": 14, "trial_tier": "starter", "max_branches": 1, "max_staff": 3}'::jsonb),
  ('features', '{}'::jsonb);

-- ─── Rate Limits ────────────────────────────────────────────────────────────

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Pending Registrations ──────────────────────────────────────────────────

CREATE TABLE pending_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  owner_name text NOT NULL,
  email text NOT NULL,
  phone text,
  country text NOT NULL DEFAULT 'US',
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Sys Audit Logs ─────────────────────────────────────────────────────────

CREATE TABLE sys_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES sys_admins(id),
  admin_name text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Emergency Controls ─────────────────────────────────────────────────────

CREATE TABLE emergency_controls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  control_type text NOT NULL, -- 'maintenance', 'store_suspend', 'broadcast'
  reason text,
  target_company_id uuid REFERENCES companies(id),
  message text,
  is_active boolean NOT NULL DEFAULT true,
  activated_by uuid NOT NULL REFERENCES sys_admins(id),
  activated_by_name text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES sys_admins(id)
);

-- ─── Ad Config ──────────────────────────────────────────────────────────────

CREATE TABLE ad_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text,
  image_url text,
  link_url text,
  placement text NOT NULL DEFAULT 'dashboard',
  target_audience text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Email Broadcasts ───────────────────────────────────────────────────────

CREATE TABLE email_broadcasts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subject text NOT NULL,
  from_name text NOT NULL DEFAULT 'PaxRest',
  body text NOT NULL,
  footer text,
  audience_type text NOT NULL DEFAULT 'all', -- 'all', 'tier:starter', 'custom'
  custom_emails text[],
  status text NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'failed'
  scheduled_at timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  created_by uuid NOT NULL REFERENCES sys_admins(id),
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Updated At Trigger Function ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
