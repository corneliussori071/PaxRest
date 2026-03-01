-- ============================================================================
-- Migration: 00041_fix_order_items_menu_item_nullable
-- Description:
--   Make order_items.menu_item_id nullable so that bar-store items,
--   accommodation-store items, and room bookings can be inserted without
--   requiring a menu_items FK reference.
--
--   Root cause: createBarOrder / createAccomOrder were using the zero UUID
--   ('00000000-0000-0000-0000-000000000000') as a placeholder for non-menu
--   items, but that UUID does not exist in menu_items, so the FK constraint
--   silently rejected every order_items insert, leaving the breakdown empty.
-- ============================================================================

-- 1. Drop the NOT NULL constraint
ALTER TABLE order_items ALTER COLUMN menu_item_id DROP NOT NULL;

-- 2. Replace the FK so it allows NULL and does SET NULL on menu item delete
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;
