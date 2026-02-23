-- ============================================================================
-- Migration: 00010_create_audit_triggers
-- Description: Generic audit trigger that auto-logs all INSERT/UPDATE/DELETE
--              on critical tables with before/after JSONB snapshots
-- ============================================================================

-- ─── Generic Audit Trigger Function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS trigger AS $$
DECLARE
  v_company_id uuid;
  v_branch_id uuid;
  v_old_data jsonb;
  v_new_data jsonb;
  v_changed text[];
  v_key text;
BEGIN
  -- Extract company_id and branch_id from the record
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_company_id := (v_old_data ->> 'company_id')::uuid;
    v_branch_id := (v_old_data ->> 'branch_id')::uuid;
  ELSE
    v_new_data := to_jsonb(NEW);
    v_company_id := (v_new_data ->> 'company_id')::uuid;
    v_branch_id := (v_new_data ->> 'branch_id')::uuid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, new_data, performed_by, created_at)
    VALUES (v_company_id, v_branch_id, TG_TABLE_NAME, NEW.id, 'INSERT', v_new_data, auth.uid(), now());
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    -- Compute changed fields
    v_changed := ARRAY(
      SELECT key
      FROM jsonb_each(v_old_data) AS o(key, val)
      WHERE v_new_data ->> key IS DISTINCT FROM v_old_data ->> key
        AND key NOT IN ('updated_at') -- Exclude auto-updated fields
    );

    -- Only log if something actually changed (besides updated_at)
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, new_data,
        changed_fields, performed_by, created_at)
      VALUES (v_company_id, v_branch_id, TG_TABLE_NAME, NEW.id, 'UPDATE',
        v_old_data, v_new_data, v_changed, auth.uid(), now());
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, performed_by, created_at)
    VALUES (v_company_id, v_branch_id, TG_TABLE_NAME, OLD.id, 'DELETE', v_old_data, auth.uid(), now());
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Apply Audit Triggers to Critical Tables ────────────────────────────────

-- Orders
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Order Items
CREATE TRIGGER audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Menu Items
CREATE TRIGGER audit_menu_items
  AFTER INSERT OR UPDATE OR DELETE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Menu Categories
CREATE TRIGGER audit_menu_categories
  AFTER INSERT OR UPDATE OR DELETE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Inventory Items
CREATE TRIGGER audit_inventory_items
  AFTER INSERT OR UPDATE OR DELETE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Wastage Records
CREATE TRIGGER audit_wastage_records
  AFTER INSERT OR UPDATE OR DELETE ON wastage_records
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Purchase Orders
CREATE TRIGGER audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Shifts
CREATE TRIGGER audit_shifts
  AFTER INSERT OR UPDATE OR DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Tables
CREATE TRIGGER audit_tables
  AFTER INSERT OR UPDATE OR DELETE ON tables
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Deliveries
CREATE TRIGGER audit_deliveries
  AFTER INSERT OR UPDATE OR DELETE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Profiles (uses different structure — no branch_id on profile directly)
CREATE OR REPLACE FUNCTION audit_profile_trigger_func()
RETURNS trigger AS $$
DECLARE
  v_old_data jsonb;
  v_new_data jsonb;
  v_changed text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_changed := ARRAY(
      SELECT key
      FROM jsonb_each(v_old_data) AS o(key, val)
      WHERE v_new_data ->> key IS DISTINCT FROM v_old_data ->> key
        AND key NOT IN ('updated_at', 'last_login_at')
    );
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, new_data,
        changed_fields, performed_by, created_at)
      VALUES (NEW.company_id, NEW.active_branch_id, 'profiles', NEW.id, 'UPDATE',
        v_old_data, v_new_data, v_changed, auth.uid(), now());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, performed_by, created_at)
    VALUES (OLD.company_id, OLD.active_branch_id, 'profiles', OLD.id, 'DELETE', to_jsonb(OLD), auth.uid(), now());
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, new_data, performed_by, created_at)
    VALUES (NEW.company_id, NEW.active_branch_id, 'profiles', NEW.id, 'INSERT', to_jsonb(NEW), auth.uid(), now());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_trigger_func();

-- Branches
CREATE OR REPLACE FUNCTION audit_branch_trigger_func()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, new_data, performed_by, created_at)
    VALUES (NEW.company_id, NEW.id, 'branches', NEW.id, 'INSERT', to_jsonb(NEW), auth.uid(), now());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, new_data,
      changed_fields, performed_by, created_at)
    VALUES (NEW.company_id, NEW.id, 'branches', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each(to_jsonb(OLD)) WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key AND key NOT IN ('updated_at')),
      auth.uid(), now());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (company_id, branch_id, table_name, record_id, action, old_data, performed_by, created_at)
    VALUES (OLD.company_id, OLD.id, 'branches', OLD.id, 'DELETE', to_jsonb(OLD), auth.uid(), now());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_branches
  AFTER INSERT OR UPDATE OR DELETE ON branches
  FOR EACH ROW EXECUTE FUNCTION audit_branch_trigger_func();

-- ─── Low Stock Notification Trigger ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS trigger AS $$
DECLARE
  v_threshold numeric;
  v_user RECORD;
BEGIN
  -- Only fire when quantity decreases
  IF NEW.quantity >= OLD.quantity THEN
    RETURN NEW;
  END IF;

  -- Check if below min_stock_level
  IF NEW.quantity <= NEW.min_stock_level AND OLD.quantity > OLD.min_stock_level THEN
    -- Notify all staff at this branch who have manage_inventory permission
    FOR v_user IN
      SELECT id, name FROM profiles
      WHERE NEW.branch_id = ANY(branch_ids)
        AND is_active = true
        AND ('manage_inventory' = ANY(permissions) OR role IN ('owner', 'general_manager', 'branch_manager'))
      LIMIT 50
    LOOP
      INSERT INTO notifications (user_id, company_id, branch_id, type, title, message, metadata)
      VALUES (
        v_user.id, NEW.company_id, NEW.branch_id, 'low_stock',
        'Low Stock Alert',
        format('%s is running low (%s %s remaining)', NEW.name, NEW.quantity, NEW.unit),
        jsonb_build_object('inventory_item_id', NEW.id, 'item_name', NEW.name, 'quantity', NEW.quantity, 'min_level', NEW.min_stock_level)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_low_stock
  AFTER UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION check_low_stock();
