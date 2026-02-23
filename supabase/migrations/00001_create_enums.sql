-- ============================================================================
-- Migration: 00001_create_enums
-- Description: Create all custom PostgreSQL enum types for PaxRest
-- ============================================================================

-- Company & Role
CREATE TYPE company_role AS ENUM (
  'owner', 'general_manager', 'branch_manager', 'cashier', 'chef',
  'bartender', 'shisha_attendant', 'waiter', 'rider', 'inventory_clerk', 'custom'
);

CREATE TYPE permission_type AS ENUM (
  'manage_menu', 'manage_orders', 'process_pos', 'view_kitchen', 'view_bar',
  'view_shisha', 'manage_delivery', 'manage_inventory', 'manage_wastage',
  'manage_purchases', 'manage_suppliers', 'manage_staff', 'manage_shifts',
  'manage_tables', 'view_reports', 'export_reports', 'manage_loyalty',
  'manage_branches', 'manage_settings', 'view_audit', 'admin_panel'
);

CREATE TYPE sys_admin_role AS ENUM ('super_admin', 'admin', 'support');

CREATE TYPE sys_admin_permission AS ENUM (
  'manage_admins', 'manage_businesses', 'manage_subscriptions', 'manage_coupons',
  'manage_ads', 'manage_broadcasts', 'emergency_controls', 'view_audit'
);

-- Order & Status
CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery', 'online');

CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'preparing', 'ready', 'served',
  'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded'
);

CREATE TYPE order_item_status AS ENUM ('pending', 'preparing', 'ready', 'served', 'cancelled');

CREATE TYPE kitchen_station AS ENUM ('kitchen', 'bar', 'shisha');

CREATE TYPE order_source AS ENUM ('pos', 'online', 'phone');

-- Payment
CREATE TYPE payment_method AS ENUM (
  'cash', 'card', 'mobile', 'stripe', 'split', 'loyalty_points', 'credit'
);

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partially_paid', 'refunded', 'failed');

-- Inventory
CREATE TYPE stock_movement_type AS ENUM (
  'purchase', 'sale_deduction', 'wastage', 'adjustment',
  'transfer_in', 'transfer_out', 'return', 'opening_stock'
);

CREATE TYPE wastage_type AS ENUM ('expired', 'damaged', 'spillage', 'other');

CREATE TYPE transfer_status AS ENUM ('pending', 'in_transit', 'received', 'cancelled');

CREATE TYPE purchase_order_status AS ENUM (
  'draft', 'submitted', 'received', 'partially_received', 'cancelled'
);

CREATE TYPE inventory_unit AS ENUM (
  'kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag', 'bottle', 'can', 'pack'
);

-- Shift & Cash
CREATE TYPE shift_status AS ENUM ('open', 'closed', 'reconciled');

CREATE TYPE cash_drawer_action AS ENUM ('open', 'close', 'cash_in', 'cash_out', 'float');

-- Delivery
CREATE TYPE delivery_status AS ENUM (
  'pending_assignment', 'assigned', 'picked_up', 'in_transit',
  'delivered', 'failed', 'returned'
);

CREATE TYPE delivery_assignment_type AS ENUM ('manual', 'auto');

CREATE TYPE vehicle_type AS ENUM ('motorcycle', 'bicycle', 'car', 'on_foot');

-- Table
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'reserved', 'dirty');

-- Loyalty
CREATE TYPE loyalty_txn_type AS ENUM ('earn', 'redeem', 'expire', 'adjust');

-- Subscription
CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'professional', 'business', 'enterprise');

CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');

CREATE TYPE subscription_payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- Notifications
CREATE TYPE notification_type AS ENUM (
  'low_stock', 'new_order', 'order_status', 'delivery_update',
  'shift_reminder', 'system', 'loyalty'
);

-- Invitations
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- Discount
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');

-- Audit
CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE');
