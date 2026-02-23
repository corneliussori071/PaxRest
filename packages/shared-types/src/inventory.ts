import type {
  StockMovementType,
  WastageType,
  TransferStatus,
  PurchaseOrderStatus,
  InventoryUnit,
} from './enums';

// ─── Inventory Item (raw ingredient / stock) ────────────────────────────────

export interface InventoryItem {
  id: string;
  company_id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  unit: InventoryUnit;
  quantity: number;
  min_stock_level: number;
  cost_per_unit: number;
  image_url: string | null;
  category: string | null;
  storage_location: string | null;
  is_active: boolean;
  last_restock_at: string | null;
  created_at: string;
  updated_at: string;
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
