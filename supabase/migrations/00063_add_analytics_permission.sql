-- ============================================================================
-- Migration 00063: Add view_analytics permission
-- ============================================================================
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'view_analytics';
