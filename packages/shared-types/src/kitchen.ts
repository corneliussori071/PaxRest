import type {
  KitchenStation,
  MealAssignmentStatus,
  MealAvailability,
} from './enums';

// ─── Meal Assignment ────────────────────────────────────────────────────────
// Created when a chef picks a dish to prepare via "Make a Dish".

export interface MealAssignment {
  id: string;
  company_id: string;
  branch_id: string;
  menu_item_id: string;
  menu_item_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  quantity: number;
  quantity_completed: number;
  status: MealAssignmentStatus;
  notes: string | null;
  station: KitchenStation;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Available Meal ─────────────────────────────────────────────────────────
// Tracks pre-made meals ready for immediate sale at POS.

export interface AvailableMeal {
  id: string;
  company_id: string;
  branch_id: string;
  menu_item_id: string;
  menu_item_name: string;
  quantity_available: number;
  prepared_by: string | null;
  prepared_by_name: string | null;
  station: KitchenStation;
  created_at: string;
  updated_at: string;
}

// ─── Kitchen Display Types ──────────────────────────────────────────────────

export interface KitchenOrder {
  order_id: string;
  order_number: number;
  order_type: string;
  table_name: string | null;
  items: KitchenOrderItem[];
  created_at: string;
  elapsed_minutes: number;
}

export interface KitchenOrderItem {
  id: string;
  menu_item_name: string;
  variant_name: string | null;
  quantity: number;
  special_instructions: string | null;
  station: KitchenStation;
  status: string;
  modifiers: { modifier_name: string; price: number }[];
  removed_ingredients: { name: string }[];
  selected_extras: { name: string; price: number }[];
}

// ─── Kitchen Stats ──────────────────────────────────────────────────────────

export interface KitchenStats {
  pending_orders: number;
  active_assignments: number;
  available_meals_count: number;
  pending_requests: number;
}

// ─── Menu Availability Update ───────────────────────────────────────────────

export interface MenuAvailabilityUpdate {
  menu_item_id: string;
  availability_status: MealAvailability;
}
