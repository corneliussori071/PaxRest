-- Add 'other_services' to order_source enum so service-only orders can use it
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'other_services';
