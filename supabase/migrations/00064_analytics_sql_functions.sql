-- ============================================================================
-- Migration 00064: Analytics SQL helper functions
-- Time-series and comparison aggregation for the Analytics page
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Revenue trend: sum of completed order totals, bucketed by period
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_revenue_trend(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_period     text  -- 'day' | 'week' | 'month'
)
RETURNS TABLE(period_label text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc(p_period, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_label,
    ROUND(SUM(total)::numeric, 2) AS value
  FROM orders
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status IN ('completed')
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY date_trunc(p_period, created_at AT TIME ZONE 'UTC')
  ORDER BY 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Wastage trend: sum of total_value from wastage_records, bucketed by period
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_wastage_trend(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_period     text
)
RETURNS TABLE(period_label text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc(p_period, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_label,
    ROUND(SUM(COALESCE(total_value, 0))::numeric, 2) AS value
  FROM wastage_records
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY date_trunc(p_period, created_at AT TIME ZONE 'UTC')
  ORDER BY 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- COGS trend: central stock_movements + internal store wastage movements
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_cogs_trend(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_period     text
)
RETURNS TABLE(period_label text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH central AS (
    SELECT
      date_trunc(p_period, created_at AT TIME ZONE 'UTC') AS period_ts,
      SUM(ABS(quantity_change) * unit_cost) AS cogs_val
    FROM stock_movements
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND movement_type IN ('sale_deduction', 'wastage')
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <= p_date_to)
    GROUP BY 1
  ),
  bar_sales AS (
    SELECT
      date_trunc(p_period, bm.created_at AT TIME ZONE 'UTC') AS period_ts,
      SUM(ABS(bm.quantity_change) * COALESCE(bi.cost_per_unit, 0)) AS cogs_val
    FROM bar_store_movements bm
    JOIN bar_store_items bi ON bi.id = bm.bar_store_item_id
    WHERE bi.company_id = p_company_id
      AND (p_branch_id IS NULL OR bm.branch_id = p_branch_id)
      AND bm.movement_type = 'sale'
      AND (p_date_from IS NULL OR bm.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR bm.created_at <= p_date_to)
    GROUP BY 1
  ),
  accom_sales AS (
    SELECT
      date_trunc(p_period, am.created_at AT TIME ZONE 'UTC') AS period_ts,
      SUM(ABS(am.quantity_change) * COALESCE(ai.cost_per_unit, 0)) AS cogs_val
    FROM accom_store_movements am
    JOIN accom_store_items ai ON ai.id = am.accom_store_item_id
    WHERE ai.company_id = p_company_id
      AND (p_branch_id IS NULL OR am.branch_id = p_branch_id)
      AND am.movement_type = 'sale'
      AND (p_date_from IS NULL OR am.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR am.created_at <= p_date_to)
    GROUP BY 1
  ),
  dept_wastage AS (
    SELECT
      date_trunc(p_period, created_at AT TIME ZONE 'UTC') AS period_ts,
      SUM(COALESCE(total_value, 0)) AS cogs_val
    FROM wastage_records
    WHERE company_id = p_company_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND source IN ('kitchen', 'bar', 'accommodation', 'custom')
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <= p_date_to)
    GROUP BY 1
  ),
  combined AS (
    SELECT period_ts, cogs_val FROM central
    UNION ALL
    SELECT period_ts, cogs_val FROM bar_sales
    UNION ALL
    SELECT period_ts, cogs_val FROM accom_sales
    UNION ALL
    SELECT period_ts, cogs_val FROM dept_wastage
  )
  SELECT
    to_char(period_ts, 'YYYY-MM-DD') AS period_label,
    ROUND(SUM(cogs_val)::numeric, 2) AS value
  FROM combined
  GROUP BY period_ts
  ORDER BY period_ts;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Sales volume trend: count of completed orders, bucketed
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_sales_volume_trend(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_period     text
)
RETURNS TABLE(period_label text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc(p_period, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_label,
    COUNT(*)::numeric AS value
  FROM orders
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status = 'completed'
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY date_trunc(p_period, created_at AT TIME ZONE 'UTC')
  ORDER BY 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Avg transaction trend: average order value, bucketed
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_avg_transaction_trend(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_period     text
)
RETURNS TABLE(period_label text, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc(p_period, created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_label,
    ROUND(AVG(total)::numeric, 2) AS value
  FROM orders
  WHERE company_id = p_company_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status = 'completed'
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY date_trunc(p_period, created_at AT TIME ZONE 'UTC')
  ORDER BY 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Compare: aggregate a metric per branch or per station
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_compare(
  p_company_id uuid,
  p_branch_id  uuid,
  p_date_from  timestamptz,
  p_date_to    timestamptz,
  p_metric     text,   -- 'revenue' | 'cogs' | 'wastage' | 'sales_volume' | 'avg_transaction' | 'net_position'
  p_compare_by text    -- 'branch' | 'station'
)
RETURNS TABLE(entity_id text, entity_label text, value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF p_metric = 'revenue' THEN
    IF p_compare_by = 'branch' THEN
      RETURN QUERY
        SELECT b.id::text, b.name, ROUND(COALESCE(SUM(o.total), 0)::numeric, 2)
        FROM branches b
        LEFT JOIN orders o ON o.branch_id = b.id
          AND o.company_id = p_company_id
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
        GROUP BY b.id, b.name ORDER BY 3 DESC;
    ELSE -- station
      RETURN QUERY
        SELECT
          oi.station::text,
          oi.station::text,
          ROUND(COALESCE(SUM(o.total / NULLIF((SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = o.id), 0)), 0)::numeric, 2)
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.company_id = p_company_id
          AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        GROUP BY oi.station ORDER BY 3 DESC;
    END IF;

  ELSIF p_metric = 'sales_volume' THEN
    IF p_compare_by = 'branch' THEN
      RETURN QUERY
        SELECT b.id::text, b.name, COUNT(o.id)::numeric
        FROM branches b
        LEFT JOIN orders o ON o.branch_id = b.id
          AND o.company_id = p_company_id
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
        GROUP BY b.id, b.name ORDER BY 3 DESC;
    ELSE
      RETURN QUERY
        SELECT oi.station::text, oi.station::text, COUNT(DISTINCT oi.order_id)::numeric
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.company_id = p_company_id
          AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        GROUP BY oi.station ORDER BY 3 DESC;
    END IF;

  ELSIF p_metric = 'wastage' THEN
    IF p_compare_by = 'branch' THEN
      RETURN QUERY
        SELECT b.id::text, b.name, ROUND(COALESCE(SUM(wr.total_value), 0)::numeric, 2)
        FROM branches b
        LEFT JOIN wastage_records wr ON wr.branch_id = b.id
          AND wr.company_id = p_company_id
          AND (p_date_from IS NULL OR wr.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR wr.created_at <= p_date_to)
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
        GROUP BY b.id, b.name ORDER BY 3 DESC;
    ELSE
      RETURN QUERY
        SELECT
          COALESCE(wr.station, wr.source, 'unknown'),
          COALESCE(wr.station, wr.source, 'unknown'),
          ROUND(SUM(COALESCE(wr.total_value, 0))::numeric, 2)
        FROM wastage_records wr
        WHERE wr.company_id = p_company_id
          AND (p_branch_id IS NULL OR wr.branch_id = p_branch_id)
          AND (p_date_from IS NULL OR wr.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR wr.created_at <= p_date_to)
        GROUP BY 1, 2 ORDER BY 3 DESC;
    END IF;

  ELSIF p_metric = 'avg_transaction' THEN
    IF p_compare_by = 'branch' THEN
      RETURN QUERY
        SELECT b.id::text, b.name, ROUND(COALESCE(AVG(o.total), 0)::numeric, 2)
        FROM branches b
        LEFT JOIN orders o ON o.branch_id = b.id
          AND o.company_id = p_company_id
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
        GROUP BY b.id, b.name ORDER BY 3 DESC;
    ELSE
      RETURN QUERY
        SELECT oi.station::text, oi.station::text,
          ROUND(AVG(o.total)::numeric, 2)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.company_id = p_company_id
          AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        GROUP BY oi.station ORDER BY 3 DESC;
    END IF;

  ELSIF p_metric = 'net_position' THEN
    -- revenue minus cogs (from stock_movements) minus wastage per branch
    IF p_compare_by = 'branch' THEN
      RETURN QUERY
        WITH rev AS (
          SELECT branch_id, COALESCE(SUM(total), 0) AS val
          FROM orders
          WHERE company_id = p_company_id
            AND status = 'completed'
            AND (p_date_from IS NULL OR created_at >= p_date_from)
            AND (p_date_to   IS NULL OR created_at <= p_date_to)
          GROUP BY branch_id
        ),
        cogs_sm AS (
          SELECT branch_id, COALESCE(SUM(ABS(quantity_change) * unit_cost), 0) AS val
          FROM stock_movements
          WHERE company_id = p_company_id
            AND movement_type IN ('sale_deduction', 'wastage')
            AND (p_date_from IS NULL OR created_at >= p_date_from)
            AND (p_date_to   IS NULL OR created_at <= p_date_to)
          GROUP BY branch_id
        ),
        dept_w AS (
          SELECT branch_id, COALESCE(SUM(total_value), 0) AS val
          FROM wastage_records
          WHERE company_id = p_company_id
            AND source IN ('kitchen', 'bar', 'accommodation', 'custom')
            AND (p_date_from IS NULL OR created_at >= p_date_from)
            AND (p_date_to   IS NULL OR created_at <= p_date_to)
          GROUP BY branch_id
        )
        SELECT
          b.id::text,
          b.name,
          ROUND((COALESCE(rev.val, 0) - COALESCE(cogs_sm.val, 0) - COALESCE(dept_w.val, 0))::numeric, 2)
        FROM branches b
        LEFT JOIN rev     ON rev.branch_id = b.id
        LEFT JOIN cogs_sm ON cogs_sm.branch_id = b.id
        LEFT JOIN dept_w  ON dept_w.branch_id = b.id
        WHERE b.company_id = p_company_id
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
        ORDER BY 3 DESC;
    ELSE
      -- Station-level net is just revenue per station (no per-station COGS breakdown)
      RETURN QUERY
        SELECT oi.station::text, oi.station::text, ROUND(SUM(o.total)::numeric, 2)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.company_id = p_company_id
          AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
          AND o.status = 'completed'
          AND (p_date_from IS NULL OR o.created_at >= p_date_from)
          AND (p_date_to   IS NULL OR o.created_at <= p_date_to)
        GROUP BY oi.station ORDER BY 3 DESC;
    END IF;
  END IF;
END;
$$;
