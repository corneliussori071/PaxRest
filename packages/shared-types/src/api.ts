// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_column?: string;
  sort_direction?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── API Response Wrappers ──────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Edge Function Request Context ──────────────────────────────────────────

export interface RequestContext {
  user_id: string;
  company_id: string;
  branch_ids: string[];
  active_branch_id: string;
  role: string;
  permissions: string[];
}

// ─── Report Types ───────────────────────────────────────────────────────────

export interface DailySalesReport {
  date: string;
  branch_id: string;
  branch_name: string;
  total_orders: number;
  total_revenue: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  average_order_value: number;
  by_order_type: Record<string, { count: number; revenue: number }>;
  by_payment_method: Record<string, { count: number; amount: number }>;
  top_items: { name: string; quantity: number; revenue: number }[];
}

export interface BranchComparisonReport {
  period: string;
  branches: {
    branch_id: string;
    branch_name: string;
    total_revenue: number;
    total_orders: number;
    average_ticket: number;
    total_wastage_value: number;
    staff_count: number;
  }[];
}

export interface InventoryUsageReport {
  branch_id: string;
  period: string;
  items: {
    inventory_item_id: string;
    name: string;
    opening_stock: number;
    purchased: number;
    used: number;
    wasted: number;
    closing_stock: number;
    cost: number;
    unit: string;
  }[];
}

export interface WastageTrendsReport {
  branch_id: string;
  period: string;
  total_value: number;
  by_type: Record<string, { count: number; value: number }>;
  by_item: { name: string; quantity: number; value: number }[];
  trend: { date: string; value: number }[];
}

export interface RiderPerformanceReport {
  branch_id: string;
  period: string;
  riders: {
    rider_id: string;
    rider_name: string;
    deliveries_completed: number;
    deliveries_failed: number;
    average_delivery_time_min: number;
    on_time_percentage: number;
    average_rating: number;
    total_distance_km: number;
  }[];
}

export interface LoyaltyUsageReport {
  company_id: string;
  period: string;
  total_active_members: number;
  new_members: number;
  total_points_earned: number;
  total_points_redeemed: number;
  total_discount_value: number;
  top_customers: {
    customer_id: string;
    name: string;
    total_spent: number;
    points_balance: number;
  }[];
}

// ─── Dashboard Widgets ──────────────────────────────────────────────────────

export interface DashboardStats {
  today_revenue: number;
  today_orders: number;
  active_orders: number;
  tables_occupied: number;
  tables_total: number;
  pending_deliveries: number;
  low_stock_items: number;
  active_shift: boolean;
  revenue_trend: { date: string; revenue: number }[];
}

// ─── Realtime Payloads ──────────────────────────────────────────────────────

export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T | null;
  old: T | null;
}
