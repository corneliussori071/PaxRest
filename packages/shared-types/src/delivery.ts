import type {
  DeliveryStatus,
  DeliveryAssignmentType,
  VehicleType,
} from './enums';
import type { CustomerAddress } from './orders';

// ─── Delivery Zone ──────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string;
  company_id: string;
  branch_id: string;
  name: string;
  delivery_fee: number;
  min_order_amount: number;
  estimated_time_min: number;
  is_active: boolean;
  polygon: GeoPolygon | null;
  created_at: string;
  updated_at: string;
}

export interface GeoPolygon {
  coordinates: [number, number][]; // [lat, lng] pairs
}

// ─── Rider ──────────────────────────────────────────────────────────────────

export interface Rider {
  id: string; // Same as profile.id
  company_id: string;
  branch_id: string;
  name: string;
  phone: string;
  vehicle_type: VehicleType;
  license_plate: string | null;
  is_available: boolean;
  is_on_delivery: boolean;
  current_location: GeoLocation | null;
  active_deliveries_count: number;
  max_concurrent_deliveries: number;
  total_deliveries: number;
  average_rating: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  updated_at: string;
}

// ─── Delivery ───────────────────────────────────────────────────────────────

export interface Delivery {
  id: string;
  order_id: string;
  order_number: number;
  company_id: string;
  branch_id: string;
  rider_id: string | null;
  rider_name: string | null;
  status: DeliveryStatus;
  assignment_type: DeliveryAssignmentType;
  pickup_address: string;
  delivery_address: CustomerAddress;
  delivery_fee: number;
  delivery_zone_id: string | null;
  estimated_pickup_time: string | null;
  actual_pickup_time: string | null;
  estimated_delivery_time: string | null;
  actual_delivery_time: string | null;
  distance_km: number | null;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  proof_of_delivery_url: string | null;
  rating: number | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Delivery Status History ────────────────────────────────────────────────

export interface DeliveryStatusHistory {
  id: string;
  delivery_id: string;
  old_status: DeliveryStatus | null;
  new_status: DeliveryStatus;
  changed_by: string;
  changed_by_name: string;
  location: GeoLocation | null;
  notes: string | null;
  created_at: string;
}

// ─── Rider Dashboard Types ──────────────────────────────────────────────────

export interface RiderDashboard {
  active_deliveries: Delivery[];
  today_completed: number;
  today_earnings: number;
  average_rating: number;
}
