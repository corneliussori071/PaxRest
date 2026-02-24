import type { KitchenStation, MealAvailability } from './enums';

// ─── Menu Category ──────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string;
  company_id: string;
  branch_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  station: KitchenStation;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Menu Item ──────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  company_id: string;
  branch_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  availability_status: MealAvailability;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  preparation_time_min: number;
  station: KitchenStation;
  sort_order: number;
  is_active: boolean;
  tags: string[];
  allergens: string[];
  calories: number | null;
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  category?: MenuCategory;
  variants?: MenuVariant[];
  modifier_groups?: ModifierGroup[];
  ingredients?: MenuItemIngredient[];
  extras?: MenuItemExtra[];
}

// ─── Menu Variant ───────────────────────────────────────────────────────────

export interface MenuVariant {
  id: string;
  menu_item_id: string;
  name: string; // e.g., "Small", "Medium", "Large"
  price_adjustment: number; // Added to base_price (+5.00, -2.00, etc.)
  sku: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Modifier Group ─────────────────────────────────────────────────────────

export interface ModifierGroup {
  id: string;
  company_id: string;
  branch_id: string;
  name: string; // e.g., "Choose your sauce", "Toppings"
  min_selections: number; // 0 = optional
  max_selections: number; // 1 = radio, >1 = checkbox
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Joined
  modifiers?: Modifier[];
}

// ─── Modifier ───────────────────────────────────────────────────────────────

export interface Modifier {
  id: string;
  modifier_group_id: string;
  name: string; // e.g., "Extra Cheese", "No Onions"
  price: number; // Additional price (can be 0)
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Menu Item ↔ Modifier Group (junction) ──────────────────────────────────

export interface MenuItemModifierGroup {
  menu_item_id: string;
  modifier_group_id: string;
}

// ─── Menu Item Ingredient (recipe) ──────────────────────────────────────────

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_id: string; // FK → inventory_items
  variant_id: string | null; // If null, applies to all variants
  name: string | null; // Display name of ingredient
  quantity_used: number; // Amount of ingredient used per 1 item
  unit: string; // Must match inventory_items.unit
  cost_contribution: number; // Price deducted when customer removes this ingredient
  created_at: string;
  // Joined
  ingredient_name?: string;
}

// ─── Menu Item Extra ────────────────────────────────────────────────────────

export interface MenuItemExtra {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  is_available: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Computed types for display ─────────────────────────────────────────────

export interface MenuItemWithDetails extends MenuItem {
  category: MenuCategory;
  variants: MenuVariant[];
  modifier_groups: (ModifierGroup & { modifiers: Modifier[] })[];
  extras: MenuItemExtra[];
  ingredients: MenuItemIngredient[];
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}
