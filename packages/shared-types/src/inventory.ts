import type {
  StockMovementType,
  WastageType,
  TransferStatus,
  PurchaseOrderStatus,
  InventoryUnit,
  PackagingType,
  WeightUnit,
  IngredientRequestStatus,
} from './enums';

// ─── Inventory Item (raw ingredient / stock) ────────────────────────────────

export interface InventoryItem {
  id: string;
  company_id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: InventoryUnit;
  quantity: number;
  min_stock_level: number;
  cost_per_unit: number;
  selling_price: number;
  packaging_type: PackagingType;
  items_per_pack: number;
  cost_per_item: number;
  weight_value: number | null;
  weight_unit: WeightUnit | null;
  image_url: string | null;
  category: string | null;
  storage_location: string | null;
  is_active: boolean;
  last_restock_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── CSV Upload Row ─────────────────────────────────────────────────────────

export interface CSVStockRow {
  name: string;
  barcode?: string;
  unit: InventoryUnit;
  quantity: number;
  cost_per_unit: number;
  selling_price?: number;
  category?: string;
  min_stock_level?: number;
  packaging_type?: PackagingType;
  items_per_pack?: number;
}

// ─── Ingredient Request ─────────────────────────────────────────────────────

export interface IngredientRequest {
  id: string;
  company_id: string;
  branch_id: string;
  requested_by: string;
  requested_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  status: IngredientRequestStatus;
  notes: string | null;
  station: string;
  created_at: string;
  updated_at: string;
  items?: IngredientRequestItem[];
}

export interface IngredientRequestItem {
  id: string;
  request_id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  quantity_requested: number;
  quantity_approved: number | null;
  unit: InventoryUnit;
}

// ─── Stock Movement (immutable ledger) ──────────────────────────────────────

export interface StockMovement {
  id: string;
  company_id: string;
  branch_id: string;
  inventory_item_id: string;
  movement_type: StockMovementType;
  quantity_change: number; // Positive for additions, negative for deductions
  quantity_before: number;
  quantity_after: number;
  unit_cost: number;
  reference_type: string | null; // 'order', 'wastage', 'purchase', 'transfer', 'adjustment'
  reference_id: string | null;
  notes: string | null;
  performed_by: string;
  performed_by_name: string;
  created_at: string;
}

// ─── Wastage Record ─────────────────────────────────────────────────────────

export interface WastageRecord {
  id: string;
  company_id: string;
  branch_id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  quantity: number;
  unit: InventoryUnit;
  unit_cost: number;
  total_value: number;
  reason: string;
  wastage_type: WastageType;
  recorded_by: string;
  recorded_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Inventory Transfer ─────────────────────────────────────────────────────

export interface InventoryTransfer {
  id: string;
  company_id: string;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
  status: TransferStatus;
  initiated_by: string;
  initiated_by_name: string;
  received_by: string | null;
  received_by_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: InventoryTransferItem[];
}

export interface InventoryTransferItem {
  id: string;
  transfer_id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  quantity: number;
  unit: InventoryUnit;
  unit_cost: number;
}

// ─── Supplier ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Purchase Order ─────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  supplier_name: string;
  order_number: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  invoice_url: string | null;
  ordered_by: string;
  ordered_by_name: string;
  received_by: string | null;
  received_by_name: string | null;
  expected_date: string | null;
  ordered_at: string;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit: InventoryUnit;
  unit_cost: number;
  total_cost: number;
}
