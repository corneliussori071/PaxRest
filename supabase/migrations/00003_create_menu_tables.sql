-- ============================================================================
-- Migration: 00003_create_menu_tables
-- Description: Menu categories, items, variants, modifier groups, modifiers,
--              item-modifier links, item ingredients (recipes)
-- ============================================================================

-- ─── Menu Categories ────────────────────────────────────────────────────────

CREATE TABLE menu_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Menu Items ─────────────────────────────────────────────────────────────

CREATE TABLE menu_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_price numeric(10,2) NOT NULL CHECK (base_price >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  preparation_time_min int NOT NULL DEFAULT 15,
  station kitchen_station NOT NULL DEFAULT 'kitchen',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  allergens text[] NOT NULL DEFAULT '{}',
  calories int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Menu Variants ──────────────────────────────────────────────────────────

CREATE TABLE menu_variants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment numeric(10,2) NOT NULL DEFAULT 0,
  sku text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Modifier Groups ────────────────────────────────────────────────────────

CREATE TABLE modifier_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_selections int NOT NULL DEFAULT 0,
  max_selections int NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Modifiers ──────────────────────────────────────────────────────────────

CREATE TABLE modifiers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Menu Item ↔ Modifier Group (many-to-many) ─────────────────────────────

CREATE TABLE menu_item_modifier_groups (
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- ─── Menu Item Ingredients (recipe definition) ─────────────────────────────
-- Links menu items to inventory items for ingredient-based auto-deduction.
-- The inventory_items table is created in the next migration, so we use
-- a deferred FK approach: create table now, add FK constraint later.

CREATE TABLE menu_item_ingredients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL, -- FK added after inventory_items table creation
  variant_id uuid REFERENCES menu_variants(id) ON DELETE SET NULL,
  quantity_used numeric(10,4) NOT NULL CHECK (quantity_used > 0),
  unit inventory_unit NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
