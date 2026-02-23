-- ============================================================================
-- Migration: 00012_create_indexes
-- Description: All composite indexes for performance.
--              Enforces (company_id, branch_id) pattern on every tenant table.
-- ============================================================================

-- ─── Core Tables ────────────────────────────────────────────────────────────

CREATE INDEX idx_companies_owner ON companies (owner_id);
CREATE INDEX idx_companies_slug ON companies (slug);
CREATE INDEX idx_companies_active ON companies (is_active) WHERE is_active = true;

CREATE INDEX idx_branches_company ON branches (company_id);
CREATE INDEX idx_branches_company_slug ON branches (company_id, slug);
CREATE INDEX idx_branches_active ON branches (company_id, is_active) WHERE is_active = true;

CREATE INDEX idx_profiles_company ON profiles (company_id);
CREATE INDEX idx_profiles_email ON profiles (email);
CREATE INDEX idx_profiles_company_active ON profiles (company_id, is_active) WHERE is_active = true;
CREATE INDEX idx_profiles_branch_ids ON profiles USING GIN (branch_ids);

CREATE INDEX idx_invitations_company ON invitations (company_id);
CREATE INDEX idx_invitations_email ON invitations (email);
CREATE INDEX idx_invitations_token ON invitations (token);
CREATE INDEX idx_invitations_status ON invitations (status) WHERE status = 'pending';

-- ─── Menu Tables ────────────────────────────────────────────────────────────

CREATE INDEX idx_menu_categories_branch ON menu_categories (company_id, branch_id);
CREATE INDEX idx_menu_categories_active ON menu_categories (company_id, branch_id, is_active, sort_order) WHERE is_active = true;

CREATE INDEX idx_menu_items_branch ON menu_items (company_id, branch_id);
CREATE INDEX idx_menu_items_category ON menu_items (category_id);
CREATE INDEX idx_menu_items_active ON menu_items (company_id, branch_id, is_available, is_active) WHERE is_active = true AND is_available = true;
CREATE INDEX idx_menu_items_station ON menu_items (branch_id, station) WHERE is_active = true;

CREATE INDEX idx_menu_variants_item ON menu_variants (menu_item_id);
CREATE INDEX idx_menu_variants_active ON menu_variants (menu_item_id, is_active) WHERE is_active = true;

CREATE INDEX idx_modifier_groups_branch ON modifier_groups (company_id, branch_id);
CREATE INDEX idx_modifiers_group ON modifiers (modifier_group_id);

CREATE INDEX idx_menu_item_ingredients_item ON menu_item_ingredients (menu_item_id);
CREATE INDEX idx_menu_item_ingredients_ingredient ON menu_item_ingredients (ingredient_id);

-- ─── Order Tables ───────────────────────────────────────────────────────────

CREATE INDEX idx_orders_company_branch ON orders (company_id, branch_id);
CREATE INDEX idx_orders_branch_created ON orders (company_id, branch_id, created_at DESC);
CREATE INDEX idx_orders_branch_status ON orders (branch_id, status);
CREATE INDEX idx_orders_status ON orders (status) WHERE status NOT IN ('completed', 'cancelled', 'refunded');
CREATE INDEX idx_orders_shift ON orders (shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX idx_orders_customer ON orders (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_orders_table ON orders (table_id) WHERE table_id IS NOT NULL;
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_station_status ON order_items (station, status) WHERE status NOT IN ('served', 'cancelled');
CREATE INDEX idx_order_items_menu_item ON order_items (menu_item_id);

CREATE INDEX idx_order_payments_order ON order_payments (order_id);
CREATE INDEX idx_order_payments_stripe ON order_payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at DESC);

-- ─── Table Management ───────────────────────────────────────────────────────

CREATE INDEX idx_tables_branch ON tables (company_id, branch_id);
CREATE INDEX idx_tables_branch_status ON tables (branch_id, status);
CREATE INDEX idx_tables_active ON tables (company_id, branch_id, is_active) WHERE is_active = true;

-- ─── Inventory Tables ───────────────────────────────────────────────────────

CREATE INDEX idx_inventory_items_branch ON inventory_items (company_id, branch_id);
CREATE INDEX idx_inventory_items_active ON inventory_items (company_id, branch_id, is_active) WHERE is_active = true;
CREATE INDEX idx_inventory_items_low_stock ON inventory_items (branch_id) WHERE is_active = true AND quantity <= min_stock_level;
CREATE INDEX idx_inventory_items_category ON inventory_items (company_id, branch_id, category);
CREATE INDEX idx_inventory_items_name ON inventory_items (company_id, branch_id, name);

CREATE INDEX idx_stock_movements_item ON stock_movements (inventory_item_id, created_at DESC);
CREATE INDEX idx_stock_movements_branch ON stock_movements (company_id, branch_id, created_at DESC);
CREATE INDEX idx_stock_movements_type ON stock_movements (movement_type, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_type, reference_id);

CREATE INDEX idx_wastage_records_branch ON wastage_records (company_id, branch_id, created_at DESC);
CREATE INDEX idx_wastage_records_item ON wastage_records (inventory_item_id);
CREATE INDEX idx_wastage_records_type ON wastage_records (wastage_type, created_at DESC);

CREATE INDEX idx_inventory_transfers_company ON inventory_transfers (company_id, created_at DESC);
CREATE INDEX idx_inventory_transfers_from ON inventory_transfers (from_branch_id, status);
CREATE INDEX idx_inventory_transfers_to ON inventory_transfers (to_branch_id, status);
CREATE INDEX idx_inventory_transfer_items_transfer ON inventory_transfer_items (transfer_id);

-- ─── Supplier & Purchase Tables ─────────────────────────────────────────────

CREATE INDEX idx_suppliers_company ON suppliers (company_id);
CREATE INDEX idx_suppliers_active ON suppliers (company_id, is_active) WHERE is_active = true;

CREATE INDEX idx_purchase_orders_branch ON purchase_orders (company_id, branch_id, created_at DESC);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders (supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders (status);
CREATE INDEX idx_purchase_order_items_po ON purchase_order_items (purchase_order_id);

-- ─── Shift & Cash Tables ────────────────────────────────────────────────────

CREATE INDEX idx_shifts_branch ON shifts (company_id, branch_id, created_at DESC);
CREATE INDEX idx_shifts_open ON shifts (branch_id, status) WHERE status = 'open';
CREATE INDEX idx_shifts_opened_by ON shifts (opened_by);

CREATE INDEX idx_cash_drawer_logs_shift ON cash_drawer_logs (shift_id, created_at);
CREATE INDEX idx_cash_drawer_logs_branch ON cash_drawer_logs (company_id, branch_id, created_at DESC);

-- ─── Delivery Tables ────────────────────────────────────────────────────────

CREATE INDEX idx_delivery_zones_branch ON delivery_zones (company_id, branch_id);
CREATE INDEX idx_delivery_zones_active ON delivery_zones (branch_id, is_active) WHERE is_active = true;

CREATE INDEX idx_riders_branch ON riders (company_id, branch_id);
CREATE INDEX idx_riders_available ON riders (branch_id, is_available, is_active) WHERE is_active = true AND is_available = true;

CREATE INDEX idx_deliveries_branch ON deliveries (company_id, branch_id, created_at DESC);
CREATE INDEX idx_deliveries_rider ON deliveries (rider_id, status);
CREATE INDEX idx_deliveries_status ON deliveries (branch_id, status) WHERE status NOT IN ('delivered', 'returned');
CREATE INDEX idx_deliveries_order ON deliveries (order_id);

CREATE INDEX idx_delivery_status_history_delivery ON delivery_status_history (delivery_id, created_at DESC);

-- ─── Loyalty Tables ─────────────────────────────────────────────────────────

CREATE INDEX idx_loyalty_programs_company ON loyalty_programs (company_id);

CREATE INDEX idx_customers_company ON customers (company_id);
CREATE INDEX idx_customers_phone ON customers (company_id, phone);
CREATE INDEX idx_customers_email ON customers (company_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_active ON customers (company_id, is_active) WHERE is_active = true;

CREATE INDEX idx_loyalty_transactions_customer ON loyalty_transactions (customer_id, created_at DESC);
CREATE INDEX idx_loyalty_transactions_branch ON loyalty_transactions (company_id, branch_id, created_at DESC);
CREATE INDEX idx_loyalty_transactions_order ON loyalty_transactions (order_id) WHERE order_id IS NOT NULL;

-- ─── Notification & Audit Tables ────────────────────────────────────────────

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_branch ON notifications (company_id, branch_id, created_at DESC);

CREATE INDEX idx_audit_logs_company_branch ON audit_logs (company_id, branch_id, created_at DESC);
CREATE INDEX idx_audit_logs_table ON audit_logs (table_name, created_at DESC);
CREATE INDEX idx_audit_logs_record ON audit_logs (record_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);
CREATE INDEX idx_audit_logs_performer ON audit_logs (performed_by, created_at DESC);

CREATE INDEX idx_file_references_company ON file_references (company_id);
CREATE INDEX idx_file_references_record ON file_references (table_name, record_id);

-- ─── Platform Tables ────────────────────────────────────────────────────────

CREATE INDEX idx_subscription_payments_company ON subscription_payments (company_id, created_at DESC);
CREATE INDEX idx_subscription_payments_status ON subscription_payments (status);
CREATE INDEX idx_subscription_payments_stripe ON subscription_payments (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE INDEX idx_coupons_code ON coupons (code);
CREATE INDEX idx_coupons_active ON coupons (is_active, valid_from, valid_to) WHERE is_active = true;

CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions (coupon_id);
CREATE INDEX idx_coupon_redemptions_company ON coupon_redemptions (company_id);

CREATE INDEX idx_sys_audit_logs_admin ON sys_audit_logs (admin_id, created_at DESC);
CREATE INDEX idx_sys_audit_logs_action ON sys_audit_logs (action, created_at DESC);

CREATE INDEX idx_emergency_controls_active ON emergency_controls (is_active) WHERE is_active = true;

CREATE INDEX idx_pending_registrations_user ON pending_registrations (user_id);
