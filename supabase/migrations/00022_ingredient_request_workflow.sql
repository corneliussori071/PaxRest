-- ============================================================================
-- Migration: 00022_ingredient_request_workflow
-- Description: Expand ingredient request workflow with disbursement,
--              receipt, and return tracking. New statuses and columns.
-- ============================================================================

-- Add new status values to the ingredient_request_status enum
ALTER TYPE ingredient_request_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE ingredient_request_status ADD VALUE IF NOT EXISTS 'disbursed';
ALTER TYPE ingredient_request_status ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE ingredient_request_status ADD VALUE IF NOT EXISTS 'returned';

-- Add columns to ingredient_requests for the expanded workflow
ALTER TABLE ingredient_requests
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_notes text,
  ADD COLUMN IF NOT EXISTS disbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_notes text;

-- Add columns to ingredient_request_items for per-item disbursement tracking
ALTER TABLE ingredient_request_items
  ADD COLUMN IF NOT EXISTS quantity_disbursed numeric(12,4),
  ADD COLUMN IF NOT EXISTS disbursement_notes text;

-- Update RLS: allow kitchen staff to update requests (for receive/return actions)
DROP POLICY IF EXISTS "Kitchen staff update requests" ON ingredient_requests;
CREATE POLICY "Kitchen staff update requests"
  ON ingredient_requests FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (has_permission('view_kitchen') OR has_permission('manage_inventory'))
  );

-- Allow kitchen staff to insert request items
DROP POLICY IF EXISTS "Kitchen staff insert request items" ON ingredient_request_items;
CREATE POLICY "Kitchen staff insert request items"
  ON ingredient_request_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ingredient_requests ir
      WHERE ir.id = ingredient_request_items.request_id
        AND ir.company_id = auth_company_id()
    )
  );

-- Allow inventory staff to update request items (for disbursement)
DROP POLICY IF EXISTS "Inventory staff update request items" ON ingredient_request_items;
CREATE POLICY "Inventory staff update request items"
  ON ingredient_request_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ingredient_requests ir
      WHERE ir.id = ingredient_request_items.request_id
        AND ir.company_id = auth_company_id()
    )
  );
