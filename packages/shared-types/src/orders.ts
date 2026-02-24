import type {
  OrderType,
  OrderStatus,
  OrderItemStatus,
  KitchenStation,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
  TableStatus,
} from './enums';

// ─── Order ──────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  company_id: string;
  branch_id: string;
  order_number: number; // Auto-incrementing per branch
  order_type: OrderType;
  status: OrderStatus;
  table_id: string | null;
  customer_id: string | null; // FK → customers (loyalty)
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: CustomerAddress | null;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  discount_amount: number;
  discount_reason: string | null;
  tip_amount: number;
  delivery_fee: number;
  loyalty_points_used: number;
  loyalty_discount: number;
  total: number;
  notes: string | null;
  source: OrderSource;
  shift_id: string | null; // FK → shifts
  created_by: string; // FK → profiles
  created_by_name: string;
  estimated_ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  refund_amount: number;
  refund_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  items?: OrderItem[];
  payments?: OrderPayment[];
  status_history?: OrderStatusHistory[];
  table?: Table;
}

export interface CustomerAddress {
  street: string;
  city: string;
  state?: string;
  zip?: string;
  country?: string;
  lat?: number;
  lng?: number;
  instructions?: string;
}

// ─── Order Item ─────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_item_name: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price: number; // base_price + variant adjustment
  modifiers: OrderItemModifier[];
  modifiers_total: number; // Sum of modifier prices × quantity
  removed_ingredients: OrderItemRemovedIngredient[];
  selected_extras: OrderItemExtra[];
  extras_total: number; // Sum of extras prices
  ingredients_discount: number; // Deduction for removed ingredients
  item_total: number; // (unit_price + modifiers_total + extras_total - ingredients_discount) × quantity
  special_instructions: string | null;
  station: KitchenStation;
  status: OrderItemStatus;
  prepared_by: string | null;
  prepared_at: string | null;
  created_at: string;
}

export interface OrderItemModifier {
  modifier_id: string;
  modifier_name: string;
  modifier_group_name: string;
  price: number;
}

export interface OrderItemRemovedIngredient {
  ingredient_id: string;
  name: string;
  cost_contribution: number; // Price deducted
}

export interface OrderItemExtra {
  extra_id: string;
  name: string;
  price: number;
}

// ─── Order Payment ──────────────────────────────────────────────────────────

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  tip_amount: number;
  stripe_payment_intent_id: string | null;
  reference: string | null; // Mobile money ref, card last 4, etc.
  status: PaymentStatus;
  processed_by: string; // FK → profiles
  processed_by_name: string;
  created_at: string;
}

// ─── Order Status History ───────────────────────────────────────────────────

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  old_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string;
  changed_by_name: string;
  notes: string | null;
  created_at: string;
}

// ─── Table ──────────────────────────────────────────────────────────────────

export interface Table {
  id: string;
  company_id: string;
  branch_id: string;
  table_number: string;
  name: string;
  capacity: number;
  section: string | null;
  status: TableStatus;
  current_order_id: string | null;
  is_active: boolean;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Computed types ─────────────────────────────────────────────────────────

export interface OrderWithDetails extends Omit<Order, 'table'> {
  items: OrderItem[];
  payments: OrderPayment[];
  table: Table | null;
}

export interface KitchenOrderItem extends OrderItem {
  order_number: number;
  order_type: OrderType;
  table_name: string | null;
  order_created_at: string;
  elapsed_minutes: number;
}
