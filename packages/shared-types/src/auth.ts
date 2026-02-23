import type {
  CompanyRole,
  Permission,
  SysAdminRole,
  SysAdminPermission,
  InvitationStatus,
  SubscriptionTier,
  BillingCycle,
  SubscriptionPaymentStatus,
  DiscountType,
} from './enums';

// ─── Auth / JWT ─────────────────────────────────────────────────────────────

export interface JWTClaims {
  sub: string;
  company_id: string | null;
  branch_ids: string[];
  active_branch_id: string | null;
  role: CompanyRole | null;
  permissions: Permission[];
}

// ─── Company ────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  country: string;
  currency: string;
  logo_url: string | null;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: string | null;
  max_branches: number;
  max_staff: number;
  is_active: boolean;
  settings: CompanySettings;
  created_at: string;
  updated_at: string;
}

export interface CompanySettings {
  default_tax_rate?: number;
  allow_tips?: boolean;
  require_table_for_dine_in?: boolean;
  auto_accept_online_orders?: boolean;
  loyalty_enabled?: boolean;
  delivery_enabled?: boolean;
}

// ─── Branch ─────────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  location: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  tax_rate: number;
  is_active: boolean;
  settings: BranchSettings;
  operating_hours: OperatingHours;
  created_at: string;
  updated_at: string;
}

export interface BranchSettings {
  low_stock_threshold_percent?: number;
  auto_assign_delivery?: boolean;
  default_preparation_time_min?: number;
  receipt_header?: string;
  receipt_footer?: string;
  allow_cash_payments?: boolean;
  allow_card_payments?: boolean;
  allow_mobile_payments?: boolean;
  allow_online_payments?: boolean;
}

export interface OperatingHours {
  [day: string]: { open: string; close: string; is_closed: boolean };
}

// ─── Profile (extends auth.users) ───────────────────────────────────────────

export interface Profile {
  id: string;
  company_id: string | null;
  branch_ids: string[];
  active_branch_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: CompanyRole;
  permissions: Permission[];
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  company_id: string;
  branch_id: string | null;
  email: string;
  role: CompanyRole;
  permissions: Permission[];
  invited_by: string;
  invited_by_name: string;
  company_name: string;
  branch_name: string | null;
  status: InvitationStatus;
  token: string;
  expires_at: string;
  created_at: string;
}

// ─── System Admin ───────────────────────────────────────────────────────────

export interface SysAdmin {
  id: string;
  name: string;
  email: string;
  role: SysAdminRole;
  permissions: SysAdminPermission[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

// ─── Subscription ───────────────────────────────────────────────────────────

export interface SubscriptionPackage {
  id: string;
  tier: SubscriptionTier;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  features: string[];
  max_branches: number;
  max_staff: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPayment {
  id: string;
  company_id: string;
  package_id: string;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  status: SubscriptionPaymentStatus;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
}

// ─── Coupon ─────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  currency: string | null;
  max_uses: number | null;
  used_count: number;
  valid_from: string;
  valid_to: string;
  applicable_tiers: SubscriptionTier[] | null;
  is_active: boolean;
  created_at: string;
}
