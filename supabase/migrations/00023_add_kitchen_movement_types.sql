-- Add kitchen_request and kitchen_return to stock_movement_type enum
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'kitchen_request';
ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'kitchen_return';
