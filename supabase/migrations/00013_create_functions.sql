-- ============================================================================
-- Migration: 00013_create_functions
-- Description: Core PostgreSQL functions for business logic:
--              - Order creation with ingredient deduction
--              - Shift management
--              - Loyalty points
--              - Paginated queries
--              - Custom JWT hook
-- ============================================================================

-- ─── Order Creation with Ingredient Auto-Deduction ──────────────────────────
-- Called from Edge Functions via supabase.rpc()
-- Atomic: if any ingredient is insufficient, entire order rolls back.

CREATE OR REPLACE FUNCTION create_order_with_deduction(
  p_company_id uuid,
  p_branch_id uuid,
  p_order_type order_type,
  p_table_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_customer_address jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source order_source DEFAULT 'pos',
  p_shift_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_created_by_name text DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_discount_reason text DEFAULT NULL,
  p_tip_amount numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_loyalty_points_used int DEFAULT 0,
  p_loyalty_discount numeric DEFAULT 0,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_item_total numeric;
  v_mod jsonb;
  v_modifiers_total numeric;
  v_ingredient RECORD;
  v_current_qty numeric;
  v_deduct_qty numeric;
  v_unit_price numeric;
  v_order_number int;
BEGIN
  -- Generate branch-scoped order number
  SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_order_number
  FROM orders WHERE branch_id = p_branch_id;

  -- Calculate totals from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_unit_price := (v_item ->> 'unit_price')::numeric;
    v_modifiers_total := COALESCE((v_item ->> 'modifiers_total')::numeric, 0);
    v_item_total := (v_unit_price + v_modifiers_total) * (v_item ->> 'quantity')::int;
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  -- Calculate tax and total
  v_tax_amount := ROUND(v_subtotal * (p_tax_rate / 100), 2);
  v_total := v_subtotal + v_tax_amount + p_tip_amount + p_delivery_fee
             - p_discount_amount - p_loyalty_discount;

  IF v_total < 0 THEN
    v_total := 0;
  END IF;

  -- Create the order
  INSERT INTO orders (
    company_id, branch_id, order_number, order_type, status, table_id,
    customer_id, customer_name, customer_phone, customer_email, customer_address,
    subtotal, tax_amount, tax_rate, discount_amount, discount_reason,
    tip_amount, delivery_fee, loyalty_points_used, loyalty_discount, total,
    notes, source, shift_id, created_by, created_by_name
  ) VALUES (
    p_company_id, p_branch_id, v_order_number, p_order_type, 'pending', p_table_id,
    p_customer_id, p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
    v_subtotal, v_tax_amount, p_tax_rate, p_discount_amount, p_discount_reason,
    p_tip_amount, p_delivery_fee, p_loyalty_points_used, p_loyalty_discount, v_total,
    p_notes, p_source, p_shift_id, p_created_by, p_created_by_name
  ) RETURNING id INTO v_order_id;

  -- Insert order items and deduct ingredients
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_unit_price := (v_item ->> 'unit_price')::numeric;
    v_modifiers_total := COALESCE((v_item ->> 'modifiers_total')::numeric, 0);
    v_item_total := (v_unit_price + v_modifiers_total) * (v_item ->> 'quantity')::int;

    INSERT INTO order_items (
      order_id, menu_item_id, menu_item_name, variant_id, variant_name,
      quantity, unit_price, modifiers, modifiers_total, item_total,
      special_instructions, station, status
    ) VALUES (
      v_order_id,
      (v_item ->> 'menu_item_id')::uuid,
      v_item ->> 'menu_item_name',
      NULLIF(v_item ->> 'variant_id', '')::uuid,
      v_item ->> 'variant_name',
      (v_item ->> 'quantity')::int,
      v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::jsonb),
      v_modifiers_total,
      v_item_total,
      v_item ->> 'special_instructions',
      COALESCE((v_item ->> 'station')::kitchen_station, 'kitchen'),
      'pending'
    );

    -- Ingredient-based deduction
    FOR v_ingredient IN
      SELECT mii.ingredient_id, mii.quantity_used, mii.unit
      FROM menu_item_ingredients mii
      WHERE mii.menu_item_id = (v_item ->> 'menu_item_id')::uuid
        AND (mii.variant_id IS NULL OR mii.variant_id = NULLIF(v_item ->> 'variant_id', '')::uuid)
    LOOP
      v_deduct_qty := v_ingredient.quantity_used * (v_item ->> 'quantity')::int;

      -- Lock the inventory row (prevents race conditions)
      SELECT quantity INTO v_current_qty
      FROM inventory_items
      WHERE id = v_ingredient.ingredient_id AND branch_id = p_branch_id
      FOR UPDATE;

      -- Check sufficient stock
      IF v_current_qty IS NULL THEN
        RAISE EXCEPTION 'Ingredient % not found in branch', v_ingredient.ingredient_id;
      END IF;

      IF v_current_qty < v_deduct_qty THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %. Available: %, Required: %',
          v_ingredient.ingredient_id, v_current_qty, v_deduct_qty;
      END IF;

      -- Deduct inventory
      UPDATE inventory_items
      SET quantity = quantity - v_deduct_qty
      WHERE id = v_ingredient.ingredient_id AND branch_id = p_branch_id;

      -- Record stock movement (immutable ledger)
      INSERT INTO stock_movements (
        company_id, branch_id, inventory_item_id, movement_type,
        quantity_change, quantity_before, quantity_after,
        unit_cost, reference_type, reference_id,
        performed_by, performed_by_name
      ) VALUES (
        p_company_id, p_branch_id, v_ingredient.ingredient_id, 'sale_deduction',
        -v_deduct_qty, v_current_qty, v_current_qty - v_deduct_qty,
        (SELECT cost_per_unit FROM inventory_items WHERE id = v_ingredient.ingredient_id),
        'order', v_order_id,
        p_created_by, p_created_by_name
      );
    END LOOP;
  END LOOP;

  -- Record initial status in history
  INSERT INTO order_status_history (order_id, new_status, changed_by, changed_by_name, notes)
  VALUES (v_order_id, 'pending', p_created_by, p_created_by_name, 'Order created');

  -- Update table status if dine-in
  IF p_table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied', current_order_id = v_order_id
    WHERE id = p_table_id AND branch_id = p_branch_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'subtotal', v_subtotal,
    'tax_amount', v_tax_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Order Status Update ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id uuid,
  p_new_status order_status,
  p_changed_by uuid,
  p_changed_by_name text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_current RECORD;
BEGIN
  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Update order
  UPDATE orders
  SET status = p_new_status,
      completed_at = CASE WHEN p_new_status IN ('completed', 'delivered') THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE id = p_order_id;

  -- Record in history
  INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, changed_by_name, notes)
  VALUES (p_order_id, v_current.status, p_new_status, p_changed_by, p_changed_by_name, p_notes);

  -- Free table when completed/cancelled
  IF p_new_status IN ('completed', 'cancelled') AND v_current.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'dirty', current_order_id = NULL
    WHERE id = v_current.table_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'old_status', v_current.status, 'new_status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Shift Open ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION open_shift(
  p_company_id uuid,
  p_branch_id uuid,
  p_opened_by uuid,
  p_opened_by_name text,
  p_opening_cash numeric
)
RETURNS jsonb AS $$
DECLARE
  v_existing_shift RECORD;
  v_shift_id uuid;
BEGIN
  -- Check no open shift exists for this branch
  SELECT * INTO v_existing_shift FROM shifts
  WHERE branch_id = p_branch_id AND status = 'open'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'A shift is already open at this branch (opened by %)', v_existing_shift.opened_by_name;
  END IF;

  INSERT INTO shifts (company_id, branch_id, opened_by, opened_by_name, status, opening_cash)
  VALUES (p_company_id, p_branch_id, p_opened_by, p_opened_by_name, 'open', p_opening_cash)
  RETURNING id INTO v_shift_id;

  -- Record cash drawer open
  INSERT INTO cash_drawer_logs (shift_id, company_id, branch_id, action, amount, running_total, reason, performed_by, performed_by_name)
  VALUES (v_shift_id, p_company_id, p_branch_id, 'open', p_opening_cash, p_opening_cash, 'Shift opened', p_opened_by, p_opened_by_name);

  RETURN jsonb_build_object('shift_id', v_shift_id, 'opening_cash', p_opening_cash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Shift Close ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id uuid,
  p_closed_by uuid,
  p_closed_by_name text,
  p_closing_cash numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_shift RECORD;
  v_expected_cash numeric;
  v_total_sales numeric;
  v_total_orders int;
  v_sales_by_payment jsonb;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or already closed';
  END IF;

  -- Calculate totals for this shift
  SELECT
    COALESCE(SUM(total), 0),
    COUNT(*)
  INTO v_total_sales, v_total_orders
  FROM orders
  WHERE shift_id = p_shift_id AND status NOT IN ('cancelled', 'refunded');

  -- Calculate sales by payment method
  SELECT COALESCE(jsonb_object_agg(pm, amt), '{}'::jsonb) INTO v_sales_by_payment
  FROM (
    SELECT op.payment_method::text AS pm, SUM(op.amount) AS amt
    FROM order_payments op
    JOIN orders o ON o.id = op.order_id
    WHERE o.shift_id = p_shift_id AND o.status NOT IN ('cancelled', 'refunded') AND op.status = 'paid'
    GROUP BY op.payment_method
  ) sub;

  -- Calculate expected cash (opening + cash sales + cash_in - cash_out)
  v_expected_cash := v_shift.opening_cash
    + COALESCE((v_sales_by_payment ->> 'cash')::numeric, 0)
    + COALESCE((SELECT SUM(amount) FROM cash_drawer_logs WHERE shift_id = p_shift_id AND action = 'cash_in'), 0)
    - COALESCE((SELECT SUM(amount) FROM cash_drawer_logs WHERE shift_id = p_shift_id AND action = 'cash_out'), 0);

  -- Close the shift
  UPDATE shifts SET
    status = 'closed',
    closed_by = p_closed_by,
    closed_by_name = p_closed_by_name,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = p_closing_cash - v_expected_cash,
    total_sales = v_total_sales,
    total_orders = v_total_orders,
    sales_by_payment = v_sales_by_payment,
    notes = p_notes,
    closed_at = now()
  WHERE id = p_shift_id;

  -- Record cash drawer close
  INSERT INTO cash_drawer_logs (shift_id, company_id, branch_id, action, amount, running_total, reason, performed_by, performed_by_name)
  VALUES (p_shift_id, v_shift.company_id, v_shift.branch_id, 'close', p_closing_cash, p_closing_cash, 'Shift closed', p_closed_by, p_closed_by_name);

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'total_sales', v_total_sales,
    'total_orders', v_total_orders,
    'expected_cash', v_expected_cash,
    'closing_cash', p_closing_cash,
    'cash_difference', p_closing_cash - v_expected_cash,
    'sales_by_payment', v_sales_by_payment
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Cash Drawer Action ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_cash_drawer_action(
  p_shift_id uuid,
  p_action cash_drawer_action,
  p_amount numeric,
  p_reason text,
  p_performed_by uuid,
  p_performed_by_name text
)
RETURNS jsonb AS $$
DECLARE
  v_shift RECORD;
  v_last_total numeric;
  v_new_total numeric;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'No open shift found'; END IF;

  -- Get current running total
  SELECT COALESCE(running_total, 0) INTO v_last_total
  FROM cash_drawer_logs WHERE shift_id = p_shift_id
  ORDER BY created_at DESC LIMIT 1;

  IF p_action = 'cash_in' THEN
    v_new_total := v_last_total + p_amount;
  ELSIF p_action = 'cash_out' THEN
    v_new_total := v_last_total - p_amount;
  ELSE
    v_new_total := v_last_total;
  END IF;

  INSERT INTO cash_drawer_logs (shift_id, company_id, branch_id, action, amount, running_total, reason, performed_by, performed_by_name)
  VALUES (p_shift_id, v_shift.company_id, v_shift.branch_id, p_action, p_amount, v_new_total, p_reason, p_performed_by, p_performed_by_name);

  RETURN jsonb_build_object('running_total', v_new_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Loyalty Points: Earn ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION earn_loyalty_points(
  p_customer_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_order_total numeric,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_program RECORD;
  v_points int;
  v_new_balance int;
BEGIN
  SELECT * INTO v_program FROM loyalty_programs WHERE company_id = p_company_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('points_earned', 0, 'message', 'No active loyalty program');
  END IF;

  v_points := FLOOR(p_order_total * v_program.points_per_currency_unit);
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('points_earned', 0);
  END IF;

  -- Update customer balance
  UPDATE customers
  SET loyalty_points_balance = loyalty_points_balance + v_points,
      total_points_earned = total_points_earned + v_points,
      total_orders = total_orders + 1,
      total_spent = total_spent + p_order_total,
      last_order_at = now()
  WHERE id = p_customer_id
  RETURNING loyalty_points_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO loyalty_transactions (customer_id, company_id, branch_id, order_id, type, points, balance_after, description, performed_by)
  VALUES (p_customer_id, p_company_id, p_branch_id, p_order_id, 'earn', v_points, v_new_balance,
    format('Earned %s points from order', v_points), p_performed_by);

  RETURN jsonb_build_object('points_earned', v_points, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Loyalty Points: Redeem ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION redeem_loyalty_points(
  p_customer_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_points_to_redeem int,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_program RECORD;
  v_customer RECORD;
  v_discount numeric;
  v_new_balance int;
BEGIN
  SELECT * INTO v_program FROM loyalty_programs WHERE company_id = p_company_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active loyalty program'; END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  IF v_customer.loyalty_points_balance < p_points_to_redeem THEN
    RAISE EXCEPTION 'Insufficient points. Available: %, Requested: %',
      v_customer.loyalty_points_balance, p_points_to_redeem;
  END IF;

  IF p_points_to_redeem < v_program.min_redeem_points THEN
    RAISE EXCEPTION 'Minimum redeem is % points', v_program.min_redeem_points;
  END IF;

  v_discount := ROUND(p_points_to_redeem / v_program.redemption_rate, 2);

  UPDATE customers
  SET loyalty_points_balance = loyalty_points_balance - p_points_to_redeem,
      total_points_redeemed = total_points_redeemed + p_points_to_redeem
  WHERE id = p_customer_id
  RETURNING loyalty_points_balance INTO v_new_balance;

  INSERT INTO loyalty_transactions (customer_id, company_id, branch_id, order_id, type, points, balance_after, description, performed_by)
  VALUES (p_customer_id, p_company_id, p_branch_id, p_order_id, 'redeem', -p_points_to_redeem, v_new_balance,
    format('Redeemed %s points for %s discount', p_points_to_redeem, v_discount), p_performed_by);

  RETURN jsonb_build_object('points_redeemed', p_points_to_redeem, 'discount', v_discount, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Wastage Recording with Stock Deduction ─────────────────────────────────

CREATE OR REPLACE FUNCTION record_wastage(
  p_company_id uuid,
  p_branch_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_wastage_type wastage_type,
  p_recorded_by uuid,
  p_recorded_by_name text,
  p_notes text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_item RECORD;
  v_wastage_id uuid;
BEGIN
  -- Lock and get inventory item
  SELECT * INTO v_item FROM inventory_items
  WHERE id = p_inventory_item_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;

  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Wastage: %', v_item.quantity, p_quantity;
  END IF;

  -- Deduct from inventory
  UPDATE inventory_items
  SET quantity = quantity - p_quantity
  WHERE id = p_inventory_item_id AND branch_id = p_branch_id;

  -- Record wastage
  INSERT INTO wastage_records (
    company_id, branch_id, inventory_item_id, inventory_item_name,
    quantity, unit, unit_cost, total_value, reason, wastage_type,
    recorded_by, recorded_by_name, notes, image_url
  ) VALUES (
    p_company_id, p_branch_id, p_inventory_item_id, v_item.name,
    p_quantity, v_item.unit, v_item.cost_per_unit, ROUND(p_quantity * v_item.cost_per_unit, 2),
    p_reason, p_wastage_type, p_recorded_by, p_recorded_by_name, p_notes, p_image_url
  ) RETURNING id INTO v_wastage_id;

  -- Record stock movement
  INSERT INTO stock_movements (
    company_id, branch_id, inventory_item_id, movement_type,
    quantity_change, quantity_before, quantity_after, unit_cost,
    reference_type, reference_id, performed_by, performed_by_name
  ) VALUES (
    p_company_id, p_branch_id, p_inventory_item_id, 'wastage',
    -p_quantity, v_item.quantity, v_item.quantity - p_quantity, v_item.cost_per_unit,
    'wastage', v_wastage_id, p_recorded_by, p_recorded_by_name
  );

  RETURN jsonb_build_object(
    'wastage_id', v_wastage_id,
    'total_value', ROUND(p_quantity * v_item.cost_per_unit, 2),
    'remaining_stock', v_item.quantity - p_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Generic Paginated Query ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_paginated(
  p_table_name text,
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 10,
  p_sort_column text DEFAULT 'created_at',
  p_sort_direction text DEFAULT 'DESC',
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_offset int;
  v_total bigint;
  v_items jsonb;
  v_where text;
  v_sql text;
BEGIN
  -- Enforce page_size limits
  IF p_page_size > 100 THEN p_page_size := 100; END IF;
  IF p_page_size < 1 THEN p_page_size := 10; END IF;
  IF p_page < 1 THEN p_page := 1; END IF;
  v_offset := (p_page - 1) * p_page_size;

  -- Build WHERE clause
  v_where := format('company_id = %L', p_company_id);
  IF p_branch_id IS NOT NULL THEN
    v_where := v_where || format(' AND branch_id = %L', p_branch_id);
  END IF;

  -- Count total
  v_sql := format('SELECT count(*) FROM %I WHERE %s', p_table_name, v_where);
  EXECUTE v_sql INTO v_total;

  -- Fetch page
  v_sql := format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT * FROM %I WHERE %s ORDER BY %I %s LIMIT %s OFFSET %s) t',
    p_table_name, v_where, p_sort_column, p_sort_direction, p_page_size, v_offset
  );
  EXECUTE v_sql INTO v_items;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', CEIL(v_total::float / p_page_size)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── Custom Access Token Hook (JWT claims injection) ────────────────────────
-- Injects company_id, branch_ids, role, permissions into the JWT

CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_profile RECORD;
  v_claims jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;

  SELECT company_id, branch_ids, active_branch_id, role, permissions
  INTO v_profile
  FROM profiles
  WHERE id = v_user_id;

  IF FOUND THEN
    v_claims := jsonb_build_object(
      'company_id', v_profile.company_id,
      'branch_ids', to_jsonb(v_profile.branch_ids),
      'active_branch_id', v_profile.active_branch_id,
      'role', v_profile.role,
      'permissions', to_jsonb(v_profile.permissions::text[])
    );
  ELSE
    v_claims := '{}'::jsonb;
  END IF;

  -- Merge into existing claims
  event := jsonb_set(event, '{claims,app_metadata}',
    COALESCE(event -> 'claims' -> 'app_metadata', '{}'::jsonb) || v_claims
  );

  RETURN event;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute on hook to supabase_auth_admin
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;

-- Grant usage on profiles table for the hook
GRANT SELECT ON profiles TO supabase_auth_admin;

-- ─── Refresh Materialized Views ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Enable Realtime ────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE tables;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
