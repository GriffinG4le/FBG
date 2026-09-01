-- ==============================================================================
-- FBG — Order Prefixes Config Table & Multi-Prefix Order Tracking Migration
-- ==============================================================================

-- 1. Create order_prefixes configuration table
CREATE TABLE IF NOT EXISTS order_prefixes (
    prefix text PRIMARY KEY,
    label text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed initial known prefixes
INSERT INTO order_prefixes (prefix, label, active) VALUES
('ORD', 'TikoHub Direct Web Store', true),
('SH', 'Shopify Secondary Channel', true),
('TKH', 'TikoHub Mobile / POS', true),
('MANUAL', 'Tent Walk-Up Direct Entry', true)
ON CONFLICT (prefix) DO UPDATE SET
    label = EXCLUDED.label,
    active = EXCLUDED.active;

-- 2. Add source_prefix column to orders table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'source_prefix'
    ) THEN
        ALTER TABLE orders ADD COLUMN source_prefix text NOT NULL DEFAULT 'ORD';
    END IF;
END $$;

-- 3. Add source_prefix column to fulfillments table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fulfillments' AND column_name = 'source_prefix'
    ) THEN
        ALTER TABLE fulfillments ADD COLUMN source_prefix text NOT NULL DEFAULT 'ORD';
    END IF;
END $$;

-- 4. Create composite indexes for prefix + order_ref lookups
CREATE INDEX IF NOT EXISTS idx_orders_prefix_ref ON orders(source_prefix, order_ref);
CREATE INDEX IF NOT EXISTS idx_fulfillments_prefix_ref ON fulfillments(source_prefix, order_ref);

-- 5. Enable RLS on order_prefixes
ALTER TABLE order_prefixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read order_prefixes" ON order_prefixes FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update order_prefixes" ON order_prefixes FOR ALL USING (true);
