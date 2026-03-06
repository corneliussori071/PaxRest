-- ============================================================================
-- Migration: 00050_rpc_extras_price_fix
-- Description: Update create_order_with_deduction to include extras_total and
--              ingredients_discount in price calculation and store them
--              in order_items along with selected_extras and removed_ingredients.
-- ============================================================================

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
  v_extras_total numeric;
  v_ingredients_discount numeric;
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
    v_extras_total := COALESCE((v_item ->> 'extras_total')::numeric, 0);
    v_ingredients_discount := COALESCE((v_item ->> 'ingredients_discount')::numeric, 0);
    v_item_total := (v_unit_price + v_modifiers_total + v_extras_total - v_ingredients_discount) * (v_item ->> 'quantity')::int;
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
    v_extras_total := COALESCE((v_item ->> 'extras_total')::numeric, 0);
    v_ingredients_discount := COALESCE((v_item ->> 'ingredients_discount')::numeric, 0);
    v_item_total := (v_unit_price + v_modifiers_total + v_extras_total - v_ingredients_discount) * (v_item ->> 'quantity')::int;

    INSERT INTO order_items (
      order_id, menu_item_id, menu_item_name, variant_id, variant_name,
      quantity, unit_price, modifiers, modifiers_total, item_total,
      selected_extras, extras_total, removed_ingredients, ingredients_discount,
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
      COALESCE(v_item -> 'selected_extras', '[]'::jsonb),
      v_extras_total,
      COALESCE(v_item -> 'removed_ingredients', '[]'::jsonb),
      v_ingredients_discount,
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
