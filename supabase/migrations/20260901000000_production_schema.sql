-- ==============================================================================
-- Fulfilled By Griphine (FBG) — Production Supabase Schema & Initial Setup
-- ==============================================================================

-- 1. LOCATIONS TABLE (Warehouses & Event Tents)
CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('warehouse', 'event')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ORDER PREFIXES TABLE (Config, Not Code)
CREATE TABLE IF NOT EXISTS order_prefixes (
    prefix text PRIMARY KEY,
    label text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. SKU CATALOG TABLE
CREATE TABLE IF NOT EXISTS catalog (
    sku text PRIMARY KEY,
    category text NOT NULL,
    color text,
    size text,
    price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
    low_stock_threshold integer NOT NULL DEFAULT 10
);

-- 4. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY,
    source_prefix text NOT NULL DEFAULT 'ORD',
    order_ref text NOT NULL,
    original_sku text NOT NULL,
    amount_paid numeric NOT NULL DEFAULT 0,
    customer_name text,
    customer_phone text,
    channel text NOT NULL DEFAULT 'Online' CHECK (channel IN ('Online', 'Event', 'Card', 'Manual')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. FULFILLMENTS TABLE (Dispatch & Swap Records)
CREATE TABLE IF NOT EXISTS fulfillments (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    source_prefix text NOT NULL,
    order_ref text NOT NULL,
    original_sku text NOT NULL,
    actual_sku text NOT NULL,
    price_delta numeric NOT NULL DEFAULT 0,
    cash_collected numeric NOT NULL DEFAULT 0,
    override_reason text,
    location_id text NOT NULL REFERENCES locations(id) ON UPDATE CASCADE,
    staff_id text NOT NULL DEFAULT 'Staff',
    notes text,
    fulfilled_at timestamptz NOT NULL DEFAULT now()
);

-- 6. IMMUTABLE LEDGER TABLE (Stock Movements & Financial Trail)
CREATE TABLE IF NOT EXISTS ledger (
    id text PRIMARY KEY,
    timestamp timestamptz NOT NULL DEFAULT now(),
    type text NOT NULL CHECK (type IN ('StockIn', 'Transfer', 'Dispatch', 'Swap', 'Correction')),
    sku text NOT NULL,
    quantity_delta integer NOT NULL,
    location_id text NOT NULL REFERENCES locations(id) ON UPDATE CASCADE,
    staff_id text NOT NULL DEFAULT 'Staff',
    order_id text,
    fulfillment_id text,
    amount numeric NOT NULL DEFAULT 0,
    notes text
);

-- 7. EVENT STOCK TRANSFERS & 2-STEP RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS event_transfers (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES locations(id) ON UPDATE CASCADE,
    sku text NOT NULL,
    allocated_qty integer NOT NULL DEFAULT 0,
    tent_staff_return_count integer,
    tent_staff_id text,
    tent_staff_submitted_at timestamptz,
    wh_verified_count integer,
    wh_staff_id text,
    wh_verified_at timestamptz,
    variance integer,
    status text NOT NULL DEFAULT 'dispatched_to_event' CHECK (status IN ('dispatched_to_event', 'return_counted_by_staff', 'verified_in_warehouse')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- INDEXES FOR HIGH-SPEED LOOKUPS
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(order_ref);
CREATE INDEX IF NOT EXISTS idx_orders_prefix ON orders(source_prefix);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_ledger_sku ON ledger(sku);
CREATE INDEX IF NOT EXISTS idx_ledger_location ON ledger(location_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
CREATE INDEX IF NOT EXISTS idx_fulfillments_order ON fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_event_transfers_event ON event_transfers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_transfers_status ON event_transfers(status);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_prefixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_transfers ENABLE ROW LEVEL SECURITY;

-- Allow public / authenticated access to all tables for fulfillment operations
CREATE POLICY "Allow public all locations" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all order_prefixes" ON order_prefixes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all catalog" ON catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all fulfillments" ON fulfillments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all ledger" ON ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all event_transfers" ON event_transfers FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- INITIAL SEED DATA (Clean Base State)
-- ==============================================================================

-- Seed Primary Warehouse and initial event location
INSERT INTO locations (id, name, type, status) VALUES
    ('wh-main', 'Main Warehouse (Nairobi HQ)', 'warehouse', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed Default Config Prefixes
INSERT INTO order_prefixes (prefix, label, active) VALUES
    ('ORD', 'TikoHub Direct Web Store', true),
    ('SH', 'Shopify Secondary Channel', true),
    ('TKH', 'TikoHub Mobile / POS', true),
    ('MANUAL', 'Tent Walk-Up Direct Entry', true)
ON CONFLICT (prefix) DO NOTHING;
