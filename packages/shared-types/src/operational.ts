import type {
  ShiftStatus,
  CashDrawerAction,
  PaymentMethod,
  LoyaltyTransactionType,
  AuditAction,
  NotificationType,
} from './enums';

// ─── Shift ──────────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  company_id: string;
  branch_id: string;
  opened_by: string;
  opened_by_name: string;
  closed_by: string | null;
  closed_by_name: string | null;
  status: ShiftStatus;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  total_sales: number;
  total_orders: number;
  sales_by_payment: Record<PaymentMethod, number>;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  created_at: string;
  // Joined
  cash_drawer_logs?: CashDrawerLog[];
}

// ─── Cash Drawer Log (immutable) ────────────────────────────────────────────

export interface CashDrawerLog {
  id: string;
  shift_id: string;
  company_id: string;
  branch_id: string;
  action: CashDrawerAction;
  amount: number;
  running_total: number;
  reason: string | null;
  performed_by: string;
  performed_by_name: string;
  created_at: string;
}

// ─── Loyalty Program ────────────────────────────────────────────────────────

export interface LoyaltyProgram {
  id: string;
  company_id: string;
  name: string;
  points_per_currency_unit: number; // e.g., 1 point per $1 spent
  redemption_rate: number; // e.g., 100 points = $1 discount
  min_redeem_points: number;
  welcome_bonus_points: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Customer (loyalty CRM) ────────────────────────────────────────────────

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string;
  loyalty_points_balance: number;
  total_points_earned: number;
  total_points_redeemed: number;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Loyalty Transaction (immutable ledger) ─────────────────────────────────

export interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  company_id: string;
  branch_id: string;
  order_id: string | null;
  type: LoyaltyTransactionType;
  points: number; // Positive for earn, negative for redeem
  balance_after: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

// ─── Audit Log (trigger-populated, immutable) ───────────────────────────────

export interface AuditLog {
  id: string;
  company_id: string;
  branch_id: string | null;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  performed_by: string | null;
  performed_by_name: string | null;
  ip_address: string | null;
  created_at: string;
}

// ─── Notification ───────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  company_id: string;
  branch_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── File Reference ─────────────────────────────────────────────────────────

export interface FileReference {
  id: string;
  company_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  table_name: string;
  record_id: string;
  uploaded_by: string;
  created_at: string;
}

// ─── Platform Audit Log (sys admin) ─────────────────────────────────────────

export interface SysAuditLog {
  id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
