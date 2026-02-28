import type { CompanyRole, Permission, OrderStatus, DeliveryStatus, KitchenStation, MealAssignmentStatus, MealAvailability, AvailableMealStatus, IngredientRequestStatus } from '@paxrest/shared-types';

// ─── Default Pagination ─────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

// ─── Role Hierarchy ─────────────────────────────────────────────────────────

export const SYSTEM_ROLES: CompanyRole[] = ['owner', 'general_manager', 'branch_manager'];

export const ROLE_HIERARCHY: Record<CompanyRole, number> = {
  owner: 100,
  general_manager: 80,
  branch_manager: 60,
  cashier: 40,
  chef: 40,
  bartender: 40,
  shisha_attendant: 40,
  waiter: 40,
  rider: 30,
  inventory_clerk: 40,
  custom: 20,
};

/**
 * Check if caller role can manage target role.
 * Port from Paxventory's canManageRole function.
 */
export function canManageRole(callerRole: CompanyRole, targetRole: CompanyRole): boolean {
  return ROLE_HIERARCHY[callerRole] > ROLE_HIERARCHY[targetRole];
}

// ─── Default Permissions per Role ───────────────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS: Record<CompanyRole, Permission[]> = {
  owner: [
    'manage_menu', 'manage_orders', 'process_pos', 'view_kitchen',
    'kitchen_orders', 'kitchen_assignments', 'kitchen_make_dish',
    'kitchen_available_meals', 'kitchen_completed', 'kitchen_ingredient_requests',
    'view_bar', 'bar_create_order', 'bar_pending_orders', 'bar_pending_payment', 'bar_request_items',
    'view_accommodation', 'accom_create_order', 'accom_pending_orders', 'accom_pending_payment',
    'accom_create_rooms', 'accom_request_items',
    'view_shisha', 'manage_delivery', 'manage_inventory',
    'manage_wastage', 'manage_purchases', 'manage_suppliers', 'manage_staff',
    'manage_shifts', 'manage_tables', 'view_reports', 'export_reports',
    'manage_loyalty', 'manage_branches', 'manage_settings', 'view_audit', 'admin_panel',
  ],
  general_manager: [
    'manage_menu', 'manage_orders', 'process_pos', 'view_kitchen',
    'kitchen_orders', 'kitchen_assignments', 'kitchen_make_dish',
    'kitchen_available_meals', 'kitchen_completed', 'kitchen_ingredient_requests',
    'view_bar', 'bar_create_order', 'bar_pending_orders', 'bar_pending_payment', 'bar_request_items',
    'view_accommodation', 'accom_create_order', 'accom_pending_orders', 'accom_pending_payment',
    'accom_create_rooms', 'accom_request_items',
    'view_shisha', 'manage_delivery', 'manage_inventory',
    'manage_wastage', 'manage_purchases', 'manage_suppliers', 'manage_staff',
    'manage_shifts', 'manage_tables', 'view_reports', 'export_reports',
    'manage_loyalty', 'manage_branches', 'view_audit',
  ],
  branch_manager: [
    'manage_menu', 'manage_orders', 'process_pos', 'view_kitchen',
    'kitchen_orders', 'kitchen_assignments', 'kitchen_make_dish',
    'kitchen_available_meals', 'kitchen_completed', 'kitchen_ingredient_requests',
    'view_bar', 'bar_create_order', 'bar_pending_orders', 'bar_pending_payment', 'bar_request_items',
    'view_accommodation', 'accom_create_order', 'accom_pending_orders', 'accom_pending_payment',
    'accom_create_rooms', 'accom_request_items',
    'view_shisha', 'manage_delivery', 'manage_inventory',
    'manage_wastage', 'manage_purchases', 'manage_suppliers', 'manage_staff',
    'manage_shifts', 'manage_tables', 'view_reports', 'manage_loyalty', 'view_audit',
  ],
  cashier: ['process_pos', 'manage_orders', 'manage_tables'],
  chef: [
    'view_kitchen', 'kitchen_orders', 'kitchen_assignments',
    'kitchen_available_meals', 'kitchen_completed', 'manage_orders',
  ],
  bartender: ['view_bar', 'bar_create_order', 'bar_pending_orders', 'bar_pending_payment', 'bar_request_items', 'manage_orders'],
  shisha_attendant: ['view_shisha', 'manage_orders'],
  waiter: ['manage_orders', 'manage_tables', 'process_pos'],
  rider: ['manage_delivery'],
  inventory_clerk: ['manage_inventory', 'manage_wastage', 'manage_purchases', 'manage_suppliers'],
  custom: [],
};

// ─── Order Status Transitions ───────────────────────────────────────────────

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'out_for_delivery', 'completed', 'cancelled'],
  served: ['completed'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: ['completed'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
  failed: ['cancelled'],
};

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Delivery Status Transitions ────────────────────────────────────────────

export const VALID_DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending_assignment: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'pending_assignment'],
  picked_up: ['in_transit'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: ['returned', 'pending_assignment'],
  returned: [],
  cancelled: [],
};

// ─── Kitchen Station Labels ─────────────────────────────────────────────────

export const STATION_LABELS: Record<KitchenStation, string> = {
  kitchen: 'Kitchen',
  bar: 'Bar',
  shisha: 'Shisha Lounge',
  accommodation: 'Accommodation',
};

// ─── Meal Availability Labels ───────────────────────────────────────────────

export const MEAL_AVAILABILITY_LABELS: Record<MealAvailability, string> = {
  available: 'Available',
  low: 'Low Stock',
  sold_out: 'Sold Out',
};

export const MEAL_AVAILABILITY_COLORS: Record<MealAvailability, string> = {
  available: 'success',
  low: 'warning',
  sold_out: 'error',
};

// ─── Available Meal Status Labels (kitchen availability for POS/terminal) ───

export const AVAILABLE_MEAL_STATUS_OPTIONS: { value: AvailableMealStatus; label: string; color: string }[] = [
  { value: 'full', label: '100% Available', color: 'success' },
  { value: 'half', label: '50% Available', color: 'info' },
  { value: 'thirty_pct', label: '30% Left', color: 'warning' },
  { value: 'ten_pct', label: '10% Left', color: 'warning' },
  { value: 'unavailable', label: 'Not Available', color: 'error' },
];

export const AVAILABLE_MEAL_STATUS_LABELS: Record<AvailableMealStatus, string> = {
  full: '100% Available',
  half: '50% Available',
  thirty_pct: '30% Left',
  ten_pct: '10% Left',
  unavailable: 'Not Available',
};

export const AVAILABLE_MEAL_STATUS_COLORS: Record<AvailableMealStatus, string> = {
  full: 'success',
  half: 'info',
  thirty_pct: 'warning',
  ten_pct: 'warning',
  unavailable: 'error',
};

// ─── Meal Assignment Status Labels ──────────────────────────────────────────

export const MEAL_ASSIGNMENT_STATUS_LABELS: Record<MealAssignmentStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  completed: 'Completed',
  rejected: 'Rejected',
  available: 'Added to Meals',
};

// ─── Ingredient Request Status Labels ───────────────────────────────────────

export const INGREDIENT_REQUEST_STATUS_LABELS: Record<IngredientRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  in_transit: 'In Transit',
  disbursed: 'Disbursed',
  received: 'Received',
  return_requested: 'Return Requested',
  returned: 'Returned',
};

export const INGREDIENT_REQUEST_STATUS_COLORS: Record<IngredientRequestStatus, string> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'error',
  fulfilled: 'success',
  cancelled: 'default',
  in_transit: 'info',
  disbursed: 'primary',
  received: 'success',
  return_requested: 'warning',
  returned: 'secondary',
};

// ─── Packaging Type Labels ──────────────────────────────────────────────────

export const PACKAGING_TYPE_LABELS = {
  single: 'Single Item',
  pack: 'Pack / Bundle',
} as const;

// ─── Inventory Categories ───────────────────────────────────────────────────

export const INVENTORY_CATEGORIES = [
  'Proteins', 'Vegetables', 'Fruits', 'Dairy', 'Grains',
  'Spices & Seasonings', 'Oils & Fats', 'Beverages', 'Frozen',
  'Canned Goods', 'Bakery', 'Condiments', 'Cleaning Supplies',
  'Packaging', 'Other',
] as const;

// ─── File Upload Limits ─────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_MEDIA_SIZE = 15 * 1024 * 1024; // 15 MB (for menu media)
export const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, 'image/gif', ...ALLOWED_VIDEO_TYPES];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'text/csv'];
export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
export const ALLOWED_CSV_TYPES = ['text/csv', 'application/vnd.ms-excel'];

// ─── Subscription Tier Hierarchy ────────────────────────────────────────────

export const TIER_HIERARCHY = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
  enterprise: 4,
} as const;

// ─── Rate Limiting Defaults ─────────────────────────────────────────────────

export const RATE_LIMITS = {
  registration: { maxRequests: 3, windowMs: 15 * 60 * 1000 },
  login: { maxRequests: 10, windowMs: 15 * 60 * 1000 },
  password_reset: { maxRequests: 3, windowMs: 60 * 60 * 1000 },
  sale: { maxRequests: 60, windowMs: 60 * 1000 },
  refund: { maxRequests: 10, windowMs: 60 * 1000 },
} as const;

// ─── Pagination Defaults ────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const;
