-- ============================================================================
-- Migration: 00009_create_reporting_views
-- Description: Views and materialized views for reporting dashboard
-- ============================================================================

-- ─── Daily Sales Summary View ───────────────────────────────────────────────

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  o.branch_id,
  b.name AS branch_name,
  DATE(o.created_at AT TIME ZONE COALESCE(b.timezone, 'UTC')) AS sale_date,
  COUNT(*) AS total_orders,
  SUM(o.total) AS total_revenue,
  SUM(o.tax_amount) AS total_tax,
  SUM(o.tip_amount) AS total_tips,
  SUM(o.discount_amount) AS total_discounts,
  SUM(o.delivery_fee) AS total_delivery_fees,
  SUM(o.refund_amount) AS total_refunds,
  ROUND(AVG(o.total), 2) AS average_order_value,
  COUNT(*) FILTER (WHERE o.order_type = 'dine_in') AS dine_in_count,
  COUNT(*) FILTER (WHERE o.order_type = 'takeaway') AS takeaway_count,
  COUNT(*) FILTER (WHERE o.order_type = 'delivery') AS delivery_count,
  COUNT(*) FILTER (WHERE o.order_type = 'online') AS online_count,
  o.company_id
FROM orders o
JOIN branches b ON o.branch_id = b.id
WHERE o.status NOT IN ('cancelled', 'refunded')
GROUP BY o.company_id, o.branch_id, b.name, b.timezone, sale_date;

-- ─── Payment Method Breakdown View ──────────────────────────────────────────

CREATE OR REPLACE VIEW v_payment_breakdown AS
SELECT
  op.order_id,
  o.company_id,
  o.branch_id,
  DATE(o.created_at) AS sale_date,
  op.payment_method,
  SUM(op.amount) AS total_amount,
  COUNT(*) AS transaction_count
FROM order_payments op
JOIN orders o ON op.order_id = o.id
WHERE op.status = 'paid'
GROUP BY op.order_id, o.company_id, o.branch_id, sale_date, op.payment_method;

-- ─── Menu Item Performance View ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_menu_performance AS
SELECT
  oi.menu_item_id,
  oi.menu_item_name,
  o.company_id,
  o.branch_id,
  COUNT(*) AS times_ordered,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.item_total) AS total_revenue,
  ROUND(AVG(oi.item_total), 2) AS avg_item_revenue,
  DATE(MIN(o.created_at)) AS first_ordered,
  DATE(MAX(o.created_at)) AS last_ordered
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.status NOT IN ('cancelled', 'refunded')
  AND oi.status != 'cancelled'
GROUP BY oi.menu_item_id, oi.menu_item_name, o.company_id, o.branch_id;

-- ─── Inventory Usage Materialized View ──────────────────────────────────────
-- Refreshed periodically via pg_cron or Edge Function

CREATE MATERIALIZED VIEW mv_inventory_usage AS
SELECT
  sm.company_id,
  sm.branch_id,
  sm.inventory_item_id,
  ii.name AS item_name,
  ii.unit,
  DATE_TRUNC('day', sm.created_at) AS usage_date,
  SUM(CASE WHEN sm.movement_type = 'opening_stock' THEN sm.quantity_change ELSE 0 END) AS opening_stock,
  SUM(CASE WHEN sm.movement_type = 'purchase' THEN sm.quantity_change ELSE 0 END) AS purchased,
  SUM(CASE WHEN sm.movement_type = 'sale_deduction' THEN ABS(sm.quantity_change) ELSE 0 END) AS used_in_sales,
  SUM(CASE WHEN sm.movement_type = 'wastage' THEN ABS(sm.quantity_change) ELSE 0 END) AS wasted,
  SUM(CASE WHEN sm.movement_type = 'transfer_in' THEN sm.quantity_change ELSE 0 END) AS transferred_in,
  SUM(CASE WHEN sm.movement_type = 'transfer_out' THEN ABS(sm.quantity_change) ELSE 0 END) AS transferred_out,
  SUM(CASE WHEN sm.movement_type = 'adjustment' THEN sm.quantity_change ELSE 0 END) AS adjusted,
  SUM(CASE WHEN sm.movement_type = 'return' THEN sm.quantity_change ELSE 0 END) AS returned,
  SUM(sm.quantity_change * sm.unit_cost) AS total_cost
FROM stock_movements sm
JOIN inventory_items ii ON sm.inventory_item_id = ii.id
GROUP BY sm.company_id, sm.branch_id, sm.inventory_item_id, ii.name, ii.unit, usage_date
WITH DATA;

-- ─── Wastage Trends View ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_wastage_trends AS
SELECT
  wr.company_id,
  wr.branch_id,
  DATE_TRUNC('month', wr.created_at) AS wastage_month,
  wr.wastage_type,
  COUNT(*) AS incident_count,
  SUM(wr.total_value) AS total_value,
  SUM(wr.quantity) AS total_quantity
FROM wastage_records wr
GROUP BY wr.company_id, wr.branch_id, wastage_month, wr.wastage_type;

-- ─── Rider Performance View ────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_rider_performance AS
SELECT
  d.rider_id,
  r.name AS rider_name,
  d.company_id,
  d.branch_id,
  COUNT(*) FILTER (WHERE d.status = 'delivered') AS deliveries_completed,
  COUNT(*) FILTER (WHERE d.status = 'failed') AS deliveries_failed,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (d.actual_delivery_time - d.actual_pickup_time)) / 60
  ) FILTER (WHERE d.status = 'delivered' AND d.actual_delivery_time IS NOT NULL AND d.actual_pickup_time IS NOT NULL), 1)
    AS avg_delivery_time_min,
  ROUND(
    (COUNT(*) FILTER (WHERE d.status = 'delivered' AND d.actual_delivery_time <= d.estimated_delivery_time))::numeric /
    NULLIF(COUNT(*) FILTER (WHERE d.status = 'delivered'), 0) * 100
  , 1) AS on_time_percentage,
  ROUND(AVG(d.rating) FILTER (WHERE d.rating IS NOT NULL), 2) AS average_rating,
  COALESCE(SUM(d.distance_km) FILTER (WHERE d.status = 'delivered'), 0) AS total_distance_km
FROM deliveries d
LEFT JOIN riders r ON d.rider_id = r.id
WHERE d.rider_id IS NOT NULL
GROUP BY d.rider_id, r.name, d.company_id, d.branch_id;

-- ─── Loyalty Usage View ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_loyalty_usage AS
SELECT
  lt.company_id,
  lt.branch_id,
  DATE_TRUNC('month', lt.created_at) AS period,
  COUNT(DISTINCT lt.customer_id) AS active_members,
  SUM(CASE WHEN lt.type = 'earn' THEN lt.points ELSE 0 END) AS total_points_earned,
  SUM(CASE WHEN lt.type = 'redeem' THEN ABS(lt.points) ELSE 0 END) AS total_points_redeemed,
  SUM(CASE WHEN lt.type = 'expire' THEN ABS(lt.points) ELSE 0 END) AS total_points_expired
FROM loyalty_transactions lt
GROUP BY lt.company_id, lt.branch_id, period;

-- ─── Shift Reconciliation View ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_shift_summary AS
SELECT
  s.id AS shift_id,
  s.company_id,
  s.branch_id,
  s.opened_by_name,
  s.closed_by_name,
  s.status,
  s.opening_cash,
  s.closing_cash,
  s.expected_cash,
  s.cash_difference,
  s.total_sales,
  s.total_orders,
  s.sales_by_payment,
  s.opened_at,
  s.closed_at,
  EXTRACT(EPOCH FROM (COALESCE(s.closed_at, now()) - s.opened_at)) / 3600 AS shift_hours,
  CASE
    WHEN s.cash_difference IS NOT NULL AND ABS(s.cash_difference) > 5 THEN 'discrepancy'
    WHEN s.status = 'reconciled' THEN 'balanced'
    ELSE s.status::text
  END AS reconciliation_status
FROM shifts s;

-- ─── Branch Comparison View ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_branch_comparison AS
SELECT
  b.company_id,
  b.id AS branch_id,
  b.name AS branch_name,
  DATE_TRUNC('month', o.created_at) AS period,
  COALESCE(SUM(o.total), 0) AS total_revenue,
  COUNT(o.id) AS total_orders,
  ROUND(COALESCE(AVG(o.total), 0), 2) AS average_ticket,
  (SELECT COUNT(*) FROM profiles p WHERE b.id = ANY(p.branch_ids) AND p.is_active = true) AS staff_count
FROM branches b
LEFT JOIN orders o ON b.id = o.branch_id AND o.status NOT IN ('cancelled', 'refunded')
GROUP BY b.company_id, b.id, b.name, period;

-- ─── Create indexes on materialized view ────────────────────────────────────

CREATE INDEX idx_mv_inventory_usage_branch ON mv_inventory_usage (company_id, branch_id, usage_date);
CREATE INDEX idx_mv_inventory_usage_item ON mv_inventory_usage (inventory_item_id, usage_date);
