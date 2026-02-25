-- ============================================================================
-- Migration: 00018_kitchen_permissions
-- Description: Add granular kitchen permissions to the permission_type enum
-- ============================================================================

-- Add new granular kitchen permissions
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_orders';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_assignments';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_make_dish';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_available_meals';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_completed';
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'kitchen_ingredient_requests';
