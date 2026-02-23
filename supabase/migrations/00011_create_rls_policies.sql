-- ============================================================================
-- Migration: 00011_create_rls_policies
-- Description: Row Level Security policies for all tables.
--              Enforces multi-tenant isolation via JWT claims.
-- ============================================================================

-- ─── Helper Functions for RLS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS uuid AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid,
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_branch_ids()
RETURNS uuid[] AS $$
  SELECT COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'branch_ids'))::uuid[]),
    (SELECT branch_ids FROM profiles WHERE id = auth.uid()),
    '{}'::uuid[]
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    (SELECT role::text FROM profiles WHERE id = auth.uid())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_permissions()
RETURNS text[] AS $$
  SELECT COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'permissions'))),
    (SELECT permissions::text[] FROM profiles WHERE id = auth.uid()),
    '{}'::text[]
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_permission(required_permission text)
RETURNS boolean AS $$
  SELECT required_permission = ANY(auth_permissions())
    OR auth_role() IN ('owner', 'general_manager');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_sys_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM sys_admins WHERE id = auth.uid() AND is_active = true);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Enable RLS on ALL tables ───────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Platform tables: admin-only access handled via service_role key
ALTER TABLE sys_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- ─── Companies Policies ─────────────────────────────────────────────────────

CREATE POLICY "companies_select" ON companies FOR SELECT
  USING (id = auth_company_id() OR is_sys_admin());

CREATE POLICY "companies_update" ON companies FOR UPDATE
  USING (id = auth_company_id() AND auth_role() = 'owner');

-- No direct insert/delete from client — handled by Edge Functions with service_role

-- ─── Branches Policies ──────────────────────────────────────────────────────

CREATE POLICY "branches_select" ON branches FOR SELECT
  USING (company_id = auth_company_id() OR is_sys_admin());

CREATE POLICY "branches_insert" ON branches FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND has_permission('manage_branches'));

CREATE POLICY "branches_update" ON branches FOR UPDATE
  USING (company_id = auth_company_id() AND has_permission('manage_branches'));

-- ─── Profiles Policies ──────────────────────────────────────────────────────

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  USING (id = auth.uid() OR company_id = auth_company_id() OR is_sys_admin());

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid() OR (company_id = auth_company_id() AND has_permission('manage_staff')));

-- ─── Invitations Policies ───────────────────────────────────────────────────

CREATE POLICY "invitations_select" ON invitations FOR SELECT
  USING (company_id = auth_company_id() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "invitations_insert" ON invitations FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND has_permission('manage_staff'));

CREATE POLICY "invitations_update" ON invitations FOR UPDATE
  USING (company_id = auth_company_id() AND has_permission('manage_staff'));

-- ─── Menu Policies (branch-scoped) ─────────────────────────────────────────

-- Categories
CREATE POLICY "menu_categories_select" ON menu_categories FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "menu_categories_insert" ON menu_categories FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

CREATE POLICY "menu_categories_update" ON menu_categories FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

CREATE POLICY "menu_categories_delete" ON menu_categories FOR DELETE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

-- Items
CREATE POLICY "menu_items_select" ON menu_items FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "menu_items_insert" ON menu_items FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

CREATE POLICY "menu_items_update" ON menu_items FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

CREATE POLICY "menu_items_delete" ON menu_items FOR DELETE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

-- Variants (through menu_item)
CREATE POLICY "menu_variants_select" ON menu_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_variants.menu_item_id
      AND mi.company_id = auth_company_id() AND mi.branch_id = ANY(auth_branch_ids())
  ));

CREATE POLICY "menu_variants_insert" ON menu_variants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_variants.menu_item_id
      AND mi.company_id = auth_company_id() AND mi.branch_id = ANY(auth_branch_ids())
  ) AND has_permission('manage_menu'));

CREATE POLICY "menu_variants_update" ON menu_variants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_variants.menu_item_id
      AND mi.company_id = auth_company_id()
  ) AND has_permission('manage_menu'));

CREATE POLICY "menu_variants_delete" ON menu_variants FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_variants.menu_item_id
      AND mi.company_id = auth_company_id()
  ) AND has_permission('manage_menu'));

-- Modifier groups
CREATE POLICY "modifier_groups_select" ON modifier_groups FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "modifier_groups_manage" ON modifier_groups FOR ALL
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_menu'));

-- Modifiers (through modifier_group)
CREATE POLICY "modifiers_select" ON modifiers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM modifier_groups mg WHERE mg.id = modifiers.modifier_group_id
      AND mg.company_id = auth_company_id()
  ));

CREATE POLICY "modifiers_manage" ON modifiers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM modifier_groups mg WHERE mg.id = modifiers.modifier_group_id
      AND mg.company_id = auth_company_id()
  ) AND has_permission('manage_menu'));

-- Menu item modifier groups junction
CREATE POLICY "menu_item_modifier_groups_select" ON menu_item_modifier_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifier_groups.menu_item_id
      AND mi.company_id = auth_company_id()
  ));

CREATE POLICY "menu_item_modifier_groups_manage" ON menu_item_modifier_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_modifier_groups.menu_item_id
      AND mi.company_id = auth_company_id()
  ) AND has_permission('manage_menu'));

-- Menu item ingredients
CREATE POLICY "menu_item_ingredients_select" ON menu_item_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_ingredients.menu_item_id
      AND mi.company_id = auth_company_id()
  ));

CREATE POLICY "menu_item_ingredients_manage" ON menu_item_ingredients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_ingredients.menu_item_id
      AND mi.company_id = auth_company_id()
  ) AND has_permission('manage_menu'));

-- ─── Order Policies ─────────────────────────────────────────────────────────

CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

-- No delete on orders
CREATE POLICY "orders_no_delete" ON orders FOR DELETE USING (false);

-- Order items
CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_items.order_id
      AND o.company_id = auth_company_id() AND o.branch_id = ANY(auth_branch_ids())
  ));

CREATE POLICY "order_items_insert" ON order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_items.order_id
      AND o.company_id = auth_company_id()
  ));

CREATE POLICY "order_items_update" ON order_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_items.order_id
      AND o.company_id = auth_company_id()
  ));

-- Order payments
CREATE POLICY "order_payments_select" ON order_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_payments.order_id
      AND o.company_id = auth_company_id()
  ));

CREATE POLICY "order_payments_insert" ON order_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_payments.order_id
      AND o.company_id = auth_company_id()
  ));

-- Order status history
CREATE POLICY "order_status_history_select" ON order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_status_history.order_id
      AND o.company_id = auth_company_id()
  ));

CREATE POLICY "order_status_history_insert" ON order_status_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_status_history.order_id
      AND o.company_id = auth_company_id()
  ));

-- ─── Table Policies ─────────────────────────────────────────────────────────

CREATE POLICY "tables_select" ON tables FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "tables_insert" ON tables FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_tables'));

CREATE POLICY "tables_update" ON tables FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "tables_delete" ON tables FOR DELETE
  USING (company_id = auth_company_id() AND has_permission('manage_tables'));

-- ─── Inventory Policies ─────────────────────────────────────────────────────

CREATE POLICY "inventory_items_select" ON inventory_items FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "inventory_items_insert" ON inventory_items FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_inventory'));

CREATE POLICY "inventory_items_update" ON inventory_items FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_inventory'));

-- Stock movements: read-only from client, writes via Edge Functions (service_role)
CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

-- Wastage
CREATE POLICY "wastage_records_select" ON wastage_records FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "wastage_records_insert" ON wastage_records FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_wastage'));

-- Transfers
CREATE POLICY "inventory_transfers_select" ON inventory_transfers FOR SELECT
  USING (company_id = auth_company_id() AND (from_branch_id = ANY(auth_branch_ids()) OR to_branch_id = ANY(auth_branch_ids())));

CREATE POLICY "inventory_transfers_insert" ON inventory_transfers FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND has_permission('manage_inventory'));

CREATE POLICY "inventory_transfers_update" ON inventory_transfers FOR UPDATE
  USING (company_id = auth_company_id());

-- Transfer items
CREATE POLICY "inventory_transfer_items_select" ON inventory_transfer_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM inventory_transfers it WHERE it.id = inventory_transfer_items.transfer_id
      AND it.company_id = auth_company_id()
  ));

CREATE POLICY "inventory_transfer_items_insert" ON inventory_transfer_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM inventory_transfers it WHERE it.id = inventory_transfer_items.transfer_id
      AND it.company_id = auth_company_id()
  ));

-- ─── Supplier Policies ──────────────────────────────────────────────────────

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND has_permission('manage_suppliers'));

CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
  USING (company_id = auth_company_id() AND has_permission('manage_suppliers'));

-- Purchase orders
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_purchases'));

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_purchases'));

-- PO items
CREATE POLICY "purchase_order_items_select" ON purchase_order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_items.purchase_order_id
      AND po.company_id = auth_company_id()
  ));

CREATE POLICY "purchase_order_items_manage" ON purchase_order_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_items.purchase_order_id
      AND po.company_id = auth_company_id()
  ) AND has_permission('manage_purchases'));

-- ─── Shift Policies ─────────────────────────────────────────────────────────

CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "shifts_insert" ON shifts FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_shifts'));

CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()) AND has_permission('manage_shifts'));

-- Cash drawer logs: read-only from client
CREATE POLICY "cash_drawer_logs_select" ON cash_drawer_logs FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

-- ─── Delivery Policies ──────────────────────────────────────────────────────

CREATE POLICY "delivery_zones_select" ON delivery_zones FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "delivery_zones_manage" ON delivery_zones FOR ALL
  USING (company_id = auth_company_id() AND has_permission('manage_delivery'));

CREATE POLICY "riders_select" ON riders FOR SELECT
  USING (company_id = auth_company_id() AND (branch_id = ANY(auth_branch_ids()) OR id = auth.uid()));

CREATE POLICY "riders_update" ON riders FOR UPDATE
  USING (company_id = auth_company_id() AND (has_permission('manage_delivery') OR id = auth.uid()));

CREATE POLICY "deliveries_select" ON deliveries FOR SELECT
  USING (company_id = auth_company_id() AND (branch_id = ANY(auth_branch_ids()) OR rider_id = auth.uid()));

CREATE POLICY "deliveries_insert" ON deliveries FOR INSERT
  WITH CHECK (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY "deliveries_update" ON deliveries FOR UPDATE
  USING (company_id = auth_company_id() AND (branch_id = ANY(auth_branch_ids()) OR rider_id = auth.uid()));

CREATE POLICY "delivery_status_history_select" ON delivery_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deliveries d WHERE d.id = delivery_status_history.delivery_id
      AND d.company_id = auth_company_id()
  ));

CREATE POLICY "delivery_status_history_insert" ON delivery_status_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM deliveries d WHERE d.id = delivery_status_history.delivery_id
      AND d.company_id = auth_company_id()
  ));

-- ─── Loyalty Policies ───────────────────────────────────────────────────────

CREATE POLICY "loyalty_programs_select" ON loyalty_programs FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "loyalty_programs_manage" ON loyalty_programs FOR ALL
  USING (company_id = auth_company_id() AND has_permission('manage_loyalty'));

CREATE POLICY "customers_select" ON customers FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "customers_insert" ON customers FOR INSERT
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING (company_id = auth_company_id());

CREATE POLICY "loyalty_transactions_select" ON loyalty_transactions FOR SELECT
  USING (company_id = auth_company_id() AND branch_id = ANY(auth_branch_ids()));

-- ─── Notification Policies ──────────────────────────────────────────────────

CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (user_id = auth.uid()); -- Mark as read

-- ─── Audit Log Policies ─────────────────────────────────────────────────────

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  USING (company_id = auth_company_id() AND has_permission('view_audit'));

-- ─── File References Policies ───────────────────────────────────────────────

CREATE POLICY "file_references_select" ON file_references FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "file_references_insert" ON file_references FOR INSERT
  WITH CHECK (company_id = auth_company_id());

-- ─── Platform Tables (admin-only via service_role, or sys_admin) ────────────

-- Subscription packages: everyone can read, admins manage
CREATE POLICY "subscription_packages_select" ON subscription_packages FOR SELECT
  USING (true); -- Public read for pricing pages

CREATE POLICY "subscription_packages_manage" ON subscription_packages FOR ALL
  USING (is_sys_admin());

-- Subscription payments: company owner can read their own
CREATE POLICY "subscription_payments_select" ON subscription_payments FOR SELECT
  USING (company_id = auth_company_id() OR is_sys_admin());

-- Platform config: everyone can read maintenance status
CREATE POLICY "platform_config_select" ON platform_config FOR SELECT
  USING (true);

CREATE POLICY "platform_config_manage" ON platform_config FOR ALL
  USING (is_sys_admin());

-- Sys admins: only sys admins can see
CREATE POLICY "sys_admins_select" ON sys_admins FOR SELECT
  USING (id = auth.uid() OR is_sys_admin());

-- Sys audit logs
CREATE POLICY "sys_audit_logs_select" ON sys_audit_logs FOR SELECT
  USING (is_sys_admin());

-- Coupons
CREATE POLICY "coupons_select" ON coupons FOR SELECT
  USING (is_active = true OR is_sys_admin());

CREATE POLICY "coupons_manage" ON coupons FOR ALL
  USING (is_sys_admin());

-- Coupon redemptions
CREATE POLICY "coupon_redemptions_select" ON coupon_redemptions FOR SELECT
  USING (company_id = auth_company_id() OR is_sys_admin());

-- Emergency controls
CREATE POLICY "emergency_controls_select" ON emergency_controls FOR SELECT
  USING (is_active = true OR is_sys_admin());

-- Ad configs
CREATE POLICY "ad_configs_select" ON ad_configs FOR SELECT
  USING (is_active = true OR is_sys_admin());

-- Email broadcasts
CREATE POLICY "email_broadcasts_select" ON email_broadcasts FOR SELECT
  USING (is_sys_admin());

-- Rate limits (service_role only, no client access)
CREATE POLICY "rate_limits_none" ON rate_limits FOR ALL USING (false);

-- Pending registrations
CREATE POLICY "pending_registrations_select" ON pending_registrations FOR SELECT
  USING (user_id = auth.uid());
