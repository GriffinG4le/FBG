-- ==============================================================================
-- FBG Inventory, Dispatch & Multi-Tenant Event System — Migration
-- ==============================================================================

-- 1. Locations Table (First-class entity for Warehouse and Events)
CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('warehouse', 'event')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Catalog Table (SKU level pricing and low stock threshold)
CREATE TABLE IF NOT EXISTS catalog (
    sku text PRIMARY KEY,
    category text NOT NULL,
    color text,
    size text,
    price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
    low_stock_threshold integer NOT NULL DEFAULT 10
);

-- 3. Orders Table (What customer originally paid for, with truncated order_ref)
CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref text NOT NULL,
    original_sku text NOT NULL REFERENCES catalog(sku) ON UPDATE CASCADE,
    amount_paid numeric NOT NULL DEFAULT 0,
    customer_name text,
    customer_phone text,
    channel text NOT NULL DEFAULT 'Online' CHECK (channel IN ('Online', 'Event', 'Card', 'Manual')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Fulfillments Table (Separate from orders: records what actually walked away)
CREATE TABLE IF NOT EXISTS fulfillments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_ref text NOT NULL,
    original_sku text NOT NULL,
    actual_sku text NOT NULL REFERENCES catalog(sku) ON UPDATE CASCADE,
    price_delta numeric NOT NULL DEFAULT 0,
    cash_collected numeric NOT NULL DEFAULT 0,
    override_reason text,
    location_id text NOT NULL REFERENCES locations(id) ON UPDATE CASCADE,
    staff_id text NOT NULL,
    notes text,
    fulfilled_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_fulfillment UNIQUE (order_id)
);

-- 5. Ledger Table (Append-only, immutable record of every unit stock movement)
CREATE TABLE IF NOT EXISTS ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp timestamptz NOT NULL DEFAULT now(),
    type text NOT NULL CHECK (type IN ('StockIn', 'Transfer', 'Dispatch', 'Swap', 'Correction')),
    sku text NOT NULL REFERENCES catalog(sku) ON UPDATE CASCADE,
    quantity_delta integer NOT NULL,
    location_id text NOT NULL REFERENCES locations(id) ON UPDATE CASCADE,
    staff_id text NOT NULL,
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    fulfillment_id uuid REFERENCES fulfillments(id) ON DELETE SET NULL,
    amount numeric NOT NULL DEFAULT 0,
    notes text
);

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog(category);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(order_ref);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_fulfillments_order_id ON fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_location ON fulfillments(location_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_date ON fulfillments(fulfilled_at);
CREATE INDEX IF NOT EXISTS idx_ledger_location_sku ON ledger(location_id, sku);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_order_id ON ledger(order_id);

-- 7. Views for Derived Stock and Checkouts (with security_invoker = true)
CREATE OR REPLACE VIEW view_stock_on_hand WITH (security_invoker = true) AS
SELECT 
    l.location_id,
    loc.name AS location_name,
    loc.type AS location_type,
    l.sku,
    c.category,
    c.color,
    c.size,
    c.price,
    c.low_stock_threshold,
    COALESCE(SUM(l.quantity_delta), 0) AS stock_on_hand
FROM ledger l
JOIN catalog c ON l.sku = c.sku
JOIN locations loc ON l.location_id = loc.id
GROUP BY l.location_id, loc.name, loc.type, l.sku, c.category, c.color, c.size, c.price, c.low_stock_threshold;

-- 8. Enable Row Level Security (RLS)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for operational client operations
CREATE POLICY "Allow public read locations" ON locations FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update locations" ON locations FOR ALL USING (true);

CREATE POLICY "Allow public read catalog" ON catalog FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update catalog" ON catalog FOR ALL USING (true);

CREATE POLICY "Allow public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update orders" ON orders FOR ALL USING (true);

CREATE POLICY "Allow public read fulfillments" ON fulfillments FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update fulfillments" ON fulfillments FOR ALL USING (true);

CREATE POLICY "Allow public read ledger" ON ledger FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update ledger" ON ledger FOR ALL USING (true);
