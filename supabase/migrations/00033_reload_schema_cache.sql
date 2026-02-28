-- ============================================================================
-- Migration: 00033_internal_store_upsert_function
-- Description:
--   Creates a SQL function to upsert items into internal stores (bar/kitchen).
--   This runs natively in PostgreSQL, bypassing PostgREST schema cache issues
--   when new columns are added to store tables.
--   Also sends NOTIFY to reload PostgREST schema cache.
-- ============================================================================

-- Upsert function for internal store items
-- Returns the store_item_id and quantity_before/after
CREATE OR REPLACE FUNCTION fn_upsert_internal_store_item(
  p_department text,            -- 'bar' or 'kitchen'
  p_company_id uuid,
  p_branch_id uuid,
  p_inventory_item_id uuid,
  p_item_name text,
  p_unit text,
  p_quantity numeric,
  p_barcode text DEFAULT NULL,
  p_selling_price numeric DEFAULT 0,
  p_cost_per_unit numeric DEFAULT 0
)
RETURNS TABLE(store_item_id uuid, qty_before numeric, qty_after numeric) AS $$
DECLARE
  v_existing_id uuid;
  v_existing_qty numeric;
BEGIN
  IF p_department = 'bar' THEN
    -- Try to find existing bar store item
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM bar_store_items
    WHERE branch_id = p_branch_id AND inventory_item_id = p_inventory_item_id;

    IF v_existing_id IS NOT NULL THEN
      -- Update existing
      UPDATE bar_store_items SET
        quantity = COALESCE(v_existing_qty, 0) + p_quantity,
        item_name = p_item_name,
        barcode = p_barcode,
        selling_price = COALESCE(p_selling_price, 0),
        cost_per_unit = COALESCE(p_cost_per_unit, 0),
        updated_at = now()
      WHERE id = v_existing_id;

      RETURN QUERY SELECT v_existing_id, COALESCE(v_existing_qty, 0)::numeric, (COALESCE(v_existing_qty, 0) + p_quantity)::numeric;
    ELSE
      -- Insert new
      INSERT INTO bar_store_items (company_id, branch_id, inventory_item_id, item_name, unit, quantity, barcode, selling_price, cost_per_unit)
      VALUES (p_company_id, p_branch_id, p_inventory_item_id, p_item_name, p_unit, p_quantity, p_barcode, COALESCE(p_selling_price, 0), COALESCE(p_cost_per_unit, 0))
      RETURNING id, 0::numeric, p_quantity::numeric
      INTO v_existing_id, v_existing_qty, v_existing_qty;

      RETURN QUERY SELECT v_existing_id, 0::numeric, p_quantity::numeric;
    END IF;
  ELSE
    -- Kitchen store
    SELECT id, quantity INTO v_existing_id, v_existing_qty
    FROM kitchen_store_items
    WHERE branch_id = p_branch_id AND inventory_item_id = p_inventory_item_id;

    IF v_existing_id IS NOT NULL THEN
      UPDATE kitchen_store_items SET
        quantity = COALESCE(v_existing_qty, 0) + p_quantity,
        item_name = p_item_name,
        barcode = p_barcode,
        selling_price = COALESCE(p_selling_price, 0),
        cost_per_unit = COALESCE(p_cost_per_unit, 0),
        updated_at = now()
      WHERE id = v_existing_id;

      RETURN QUERY SELECT v_existing_id, COALESCE(v_existing_qty, 0)::numeric, (COALESCE(v_existing_qty, 0) + p_quantity)::numeric;
    ELSE
      INSERT INTO kitchen_store_items (company_id, branch_id, inventory_item_id, item_name, unit, quantity, barcode, selling_price, cost_per_unit)
      VALUES (p_company_id, p_branch_id, p_inventory_item_id, p_item_name, p_unit, p_quantity, p_barcode, COALESCE(p_selling_price, 0), COALESCE(p_cost_per_unit, 0))
      RETURNING id, 0::numeric, p_quantity::numeric
      INTO v_existing_id, v_existing_qty, v_existing_qty;

      RETURN QUERY SELECT v_existing_id, 0::numeric, p_quantity::numeric;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
