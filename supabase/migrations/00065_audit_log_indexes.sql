-- ============================================================================
-- Migration: 00065_audit_log_indexes
-- Description: Add composite indexes on audit_logs for efficient paginated
--              queries (by company + date, branch + date, performer, table).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created
  ON audit_logs (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by
  ON audit_logs (performed_by);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name
  ON audit_logs (table_name);
