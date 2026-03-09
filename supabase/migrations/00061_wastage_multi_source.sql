-- ============================================================================
-- Migration 00061: Extend wastage_records for multi-source wastage
-- Adds source tracking (central inventory, kitchen, bar, accommodation, custom)
-- and columns for custom (non-inventory) wastage items.
-- ============================================================================

-- Add source columns to wastage_records
ALTER TABLE wastage_records
  ALTER COLUMN inventory_item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS store_item_id uuid,
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS station text,
  ADD COLUMN IF NOT EXISTS description text;

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_wastage_records_source
  ON wastage_records (company_id, source, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- DB function: record wastage from kitchen internal store
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_kitchen_store_wastage(
  p_company_id uuid,
  p_branch_id uuid,
  p_store_item_id uuid,
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
  v_unit_cost numeric;
  v_total_value numeric;
BEGIN
  SELECT * INTO v_item FROM kitchen_store_items
  WHERE id = p_store_item_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Kitchen store item not found'; END IF;
  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Wastage: %', v_item.quantity, p_quantity;
  END IF;

  v_unit_cost := COALESCE(NULLIF(v_item.cost_per_unit, 0), v_item.selling_price, 0);
  v_total_value := ROUND(p_quantity * v_unit_cost, 2);

  UPDATE kitchen_store_items SET quantity = quantity - p_quantity WHERE id = p_store_item_id;

  INSERT INTO wastage_records (
    company_id, branch_id, source, store_item_id, inventory_item_id,
    inventory_item_name, quantity, unit, unit_cost, total_value,
    reason, wastage_type, recorded_by, recorded_by_name, notes, image_url
  ) VALUES (
    p_company_id, p_branch_id, 'kitchen', p_store_item_id, v_item.inventory_item_id,
    v_item.item_name, p_quantity, v_item.unit, v_unit_cost, v_total_value,
    p_reason, p_wastage_type, p_recorded_by, p_recorded_by_name, p_notes, p_image_url
  ) RETURNING id INTO v_wastage_id;

  INSERT INTO kitchen_store_movements (
    company_id, branch_id, kitchen_store_item_id, inventory_item_id,
    movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reference_id, performed_by, performed_by_name, notes
  ) VALUES (
    p_company_id, p_branch_id, p_store_item_id, v_item.inventory_item_id,
    'wastage', -p_quantity, v_item.quantity, v_item.quantity - p_quantity,
    'wastage', v_wastage_id, p_recorded_by, p_recorded_by_name, p_reason
  );

  RETURN jsonb_build_object(
    'wastage_id', v_wastage_id, 'total_value', v_total_value,
    'remaining_stock', v_item.quantity - p_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- DB function: record wastage from bar internal store
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_bar_store_wastage(
  p_company_id uuid,
  p_branch_id uuid,
  p_store_item_id uuid,
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
  v_unit_cost numeric;
  v_total_value numeric;
BEGIN
  SELECT * INTO v_item FROM bar_store_items
  WHERE id = p_store_item_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bar store item not found'; END IF;
  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Wastage: %', v_item.quantity, p_quantity;
  END IF;

  v_unit_cost := COALESCE(NULLIF(v_item.cost_per_unit, 0), v_item.selling_price, 0);
  v_total_value := ROUND(p_quantity * v_unit_cost, 2);

  UPDATE bar_store_items SET quantity = quantity - p_quantity WHERE id = p_store_item_id;

  INSERT INTO wastage_records (
    company_id, branch_id, source, store_item_id, inventory_item_id,
    inventory_item_name, quantity, unit, unit_cost, total_value,
    reason, wastage_type, recorded_by, recorded_by_name, notes, image_url
  ) VALUES (
    p_company_id, p_branch_id, 'bar', p_store_item_id, v_item.inventory_item_id,
    v_item.item_name, p_quantity, v_item.unit, v_unit_cost, v_total_value,
    p_reason, p_wastage_type, p_recorded_by, p_recorded_by_name, p_notes, p_image_url
  ) RETURNING id INTO v_wastage_id;

  INSERT INTO bar_store_movements (
    company_id, branch_id, bar_store_item_id, inventory_item_id,
    movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reference_id, performed_by, performed_by_name, notes
  ) VALUES (
    p_company_id, p_branch_id, p_store_item_id, v_item.inventory_item_id,
    'wastage', -p_quantity, v_item.quantity, v_item.quantity - p_quantity,
    'wastage', v_wastage_id, p_recorded_by, p_recorded_by_name, p_reason
  );

  RETURN jsonb_build_object(
    'wastage_id', v_wastage_id, 'total_value', v_total_value,
    'remaining_stock', v_item.quantity - p_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- DB function: record wastage from accommodation internal store
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_accom_store_wastage(
  p_company_id uuid,
  p_branch_id uuid,
  p_store_item_id uuid,
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
  v_unit_cost numeric;
  v_total_value numeric;
BEGIN
  SELECT * INTO v_item FROM accom_store_items
  WHERE id = p_store_item_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Accommodation store item not found'; END IF;
  IF v_item.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Wastage: %', v_item.quantity, p_quantity;
  END IF;

  v_unit_cost := COALESCE(v_item.selling_price, 0);
  v_total_value := ROUND(p_quantity * v_unit_cost, 2);

  UPDATE accom_store_items SET quantity = quantity - p_quantity WHERE id = p_store_item_id;

  INSERT INTO wastage_records (
    company_id, branch_id, source, store_item_id, inventory_item_id,
    inventory_item_name, quantity, unit, unit_cost, total_value,
    reason, wastage_type, recorded_by, recorded_by_name, notes, image_url
  ) VALUES (
    p_company_id, p_branch_id, 'accommodation', p_store_item_id, v_item.inventory_item_id,
    v_item.item_name, p_quantity, v_item.unit, v_unit_cost, v_total_value,
    p_reason, p_wastage_type, p_recorded_by, p_recorded_by_name, p_notes, p_image_url
  ) RETURNING id INTO v_wastage_id;

  INSERT INTO accom_store_movements (
    company_id, branch_id, accom_store_item_id, inventory_item_id,
    movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reference_id, performed_by, performed_by_name, notes
  ) VALUES (
    p_company_id, p_branch_id, p_store_item_id, v_item.inventory_item_id,
    'wastage', -p_quantity, v_item.quantity, v_item.quantity - p_quantity,
    'wastage', v_wastage_id, p_recorded_by, p_recorded_by_name, p_reason
  );

  RETURN jsonb_build_object(
    'wastage_id', v_wastage_id, 'total_value', v_total_value,
    'remaining_stock', v_item.quantity - p_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- DB function: record custom (non-inventory) wastage
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_custom_wastage(
  p_company_id uuid,
  p_branch_id uuid,
  p_item_name text,
  p_quantity numeric,
  p_estimated_value numeric,
  p_reason text,
  p_wastage_type wastage_type,
  p_station text,
  p_description text,
  p_recorded_by uuid,
  p_recorded_by_name text,
  p_notes text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_wastage_id uuid;
BEGIN
  INSERT INTO wastage_records (
    company_id, branch_id, source, inventory_item_id, inventory_item_name,
    quantity, unit, unit_cost, total_value, estimated_value,
    reason, wastage_type, station, description,
    recorded_by, recorded_by_name, notes, image_url
  ) VALUES (
    p_company_id, p_branch_id, 'custom', NULL, p_item_name,
    p_quantity, 'pcs', 0, p_estimated_value, p_estimated_value,
    p_reason, p_wastage_type, p_station, p_description,
    p_recorded_by, p_recorded_by_name, p_notes, p_image_url
  ) RETURNING id INTO v_wastage_id;

  RETURN jsonb_build_object(
    'wastage_id', v_wastage_id,
    'total_value', p_estimated_value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
