// ─── Company & Role Enums ───────────────────────────────────────────────────

export type CompanyRole =
  | 'owner'
  | 'general_manager'
  | 'branch_manager'
  | 'cashier'
  | 'chef'
  | 'bartender'
  | 'shisha_attendant'
  | 'waiter'
  | 'rider'
  | 'inventory_clerk'
  | 'custom';

export type Permission =
  | 'manage_menu'
  | 'manage_orders'
  | 'process_pos'
  | 'view_kitchen'
  | 'view_bar'
  | 'view_shisha'
  | 'manage_delivery'
  | 'manage_inventory'
  | 'manage_wastage'
  | 'manage_purchases'
  | 'manage_suppliers'
  | 'manage_staff'
  | 'manage_shifts'
  | 'manage_tables'
  | 'view_reports'
  | 'export_reports'
  | 'manage_loyalty'
  | 'manage_branches'
  | 'manage_settings'
  | 'view_audit'
  | 'admin_panel';

export type SysAdminRole = 'super_admin' | 'admin' | 'support';

export type SysAdminPermission =
  | 'manage_admins'
  | 'manage_businesses'
  | 'manage_subscriptions'
  | 'manage_coupons'
  | 'manage_ads'
  | 'manage_broadcasts'
  | 'emergency_controls'
  | 'view_audit';

// ─── Order & Status Enums ───────────────────────────────────────────────────

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'online';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type OrderItemStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

export type KitchenStation = 'kitchen' | 'bar' | 'shisha';

export type OrderSource = 'pos' | 'online' | 'phone' | 'kitchen';

// ─── Payment Enums ──────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'mobile'
  | 'stripe'
  | 'split'
  | 'loyalty_points'
  | 'credit';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'partially_paid'
  | 'refunded'
  | 'failed';

// ─── Inventory Enums ────────────────────────────────────────────────────────

export type StockMovementType =
  | 'purchase'
  | 'sale_deduction'
  | 'wastage'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'return'
  | 'opening_stock';

export type WastageType = 'expired' | 'damaged' | 'spillage' | 'other';

export type TransferStatus =
  | 'pending'
  | 'in_transit'
  | 'received'
  | 'cancelled';

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'received'
  | 'partially_received'
  | 'cancelled';

// ─── Shift & Cash Enums ────────────────────────────────────────────────────

export type ShiftStatus = 'open' | 'closed' | 'reconciled';

export type CashDrawerAction =
  | 'open'
  | 'close'
  | 'cash_in'
  | 'cash_out'
  | 'float';

// ─── Delivery Enums ─────────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'pending_assignment'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'returned'
  | 'cancelled';

export type DeliveryAssignmentType = 'manual' | 'auto';

export type VehicleType = 'motorcycle' | 'bicycle' | 'car' | 'on_foot';

// ─── Table Enums ────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty';

// ─── Loyalty Enums ──────────────────────────────────────────────────────────

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'expire' | 'adjust';

// ─── Subscription Enums ─────────────────────────────────────────────────────

export type SubscriptionTier =
  | 'free'
  | 'starter'
  | 'professional'
  | 'business'
  | 'enterprise';

export type BillingCycle = 'monthly' | 'yearly';

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded';

// ─── Audit Enums ────────────────────────────────────────────────────────────

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

// ─── Notification Enums ─────────────────────────────────────────────────────

export type NotificationType =
  | 'low_stock'
  | 'new_order'
  | 'order_status'
  | 'delivery_update'
  | 'shift_reminder'
  | 'system'
  | 'loyalty';

// ─── Invitation Enums ───────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

// ─── Discount Enums ─────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed';

// ─── Unit Types ─────────────────────────────────────────────────────────────

export type InventoryUnit =
  | 'kg'
  | 'g'
  | 'L'
  | 'ml'
  | 'pcs'
  | 'dozen'
  | 'box'
  | 'bag'
  | 'bottle'
  | 'can'
  | 'pack';

// ─── Packaging & Weight Enums ───────────────────────────────────────────────

export type PackagingType = 'single' | 'pack';

export type WeightUnit = 'kg' | 'g' | 'lb' | 'oz';

// ─── Kitchen / Meal Enums ───────────────────────────────────────────────────

export type MealAvailability = 'available' | 'low' | 'sold_out';

export type MealAssignmentStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'rejected';

export type IngredientRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled';
