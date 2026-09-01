-- ==============================================================================
-- FBG Inventory, Dispatch & Multi-Tenant Event System — Seeds
-- ==============================================================================

-- 1. Seed Locations (First-class locations: Warehouse and Events)
INSERT INTO locations (id, name, type, status) VALUES
('wh-main', 'Main Warehouse (Nairobi HQ)', 'warehouse', 'active'),
('evt-sp7s', 'SportPesa 7s (RFUEA Ground)', 'event', 'active'),
('evt-driftwood', 'Driftwood 7s (Mombasa MSC)', 'event', 'active')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    status = EXCLUDED.status;

-- 2. Seed Catalog with Complete SKU Details and Pricing
INSERT INTO catalog (sku, category, color, size, price, low_stock_threshold) VALUES
-- SportPesa Fan Jerseys (KES 2500)
('Fan Jersey|White|S', 'Fan Jersey', 'White', 'S', 2500, 10),
('Fan Jersey|White|M', 'Fan Jersey', 'White', 'M', 2500, 15),
('Fan Jersey|White|L', 'Fan Jersey', 'White', 'L', 2500, 15),
('Fan Jersey|White|XL', 'Fan Jersey', 'White', 'XL', 2500, 10),
('Fan Jersey|White|XXL', 'Fan Jersey', 'White', 'XXL', 2500, 5),
('Fan Jersey|Red|S', 'Fan Jersey', 'Red', 'S', 2500, 10),
('Fan Jersey|Red|M', 'Fan Jersey', 'Red', 'M', 2500, 15),
('Fan Jersey|Red|L', 'Fan Jersey', 'Red', 'L', 2500, 15),
('Fan Jersey|Red|XL', 'Fan Jersey', 'Red', 'XL', 2500, 10),
('Fan Jersey|Red|XXL', 'Fan Jersey', 'Red', 'XXL', 2500, 5),
('Fan Jersey|Black|S', 'Fan Jersey', 'Black', 'S', 2500, 10),
('Fan Jersey|Black|M', 'Fan Jersey', 'Black', 'M', 2500, 15),
('Fan Jersey|Black|L', 'Fan Jersey', 'Black', 'L', 2500, 15),
('Fan Jersey|Black|XL', 'Fan Jersey', 'Black', 'XL', 2500, 10),
('Fan Jersey|Black|XXL', 'Fan Jersey', 'Black', 'XXL', 2500, 5),

-- Crew Necks (KES 2250)
('Crew Neck|Navy|S', 'Crew Neck', 'Navy', 'S', 2250, 8),
('Crew Neck|Navy|M', 'Crew Neck', 'Navy', 'M', 2250, 10),
('Crew Neck|Navy|L', 'Crew Neck', 'Navy', 'L', 2250, 10),
('Crew Neck|Navy|XL', 'Crew Neck', 'Navy', 'XL', 2250, 8),
('Crew Neck|Grey|S', 'Crew Neck', 'Grey', 'S', 2250, 8),
('Crew Neck|Grey|M', 'Crew Neck', 'Grey', 'M', 2250, 10),
('Crew Neck|Grey|L', 'Crew Neck', 'Grey', 'L', 2250, 10),
('Crew Neck|Grey|XL', 'Crew Neck', 'Grey', 'XL', 2250, 8),
('Crew Neck|Black|S', 'Crew Neck', 'Black', 'S', 2250, 8),
('Crew Neck|Black|M', 'Crew Neck', 'Black', 'M', 2250, 10),
('Crew Neck|Black|L', 'Crew Neck', 'Black', 'L', 2250, 10),
('Crew Neck|Black|XL', 'Crew Neck', 'Black', 'XL', 2250, 8),

-- KRU Replica Jerseys (KES 3000)
('KRU Replica|Green|S', 'KRU Replica', 'Green', 'S', 3000, 5),
('KRU Replica|Green|M', 'KRU Replica', 'Green', 'M', 3000, 8),
('KRU Replica|Green|L', 'KRU Replica', 'Green', 'L', 3000, 8),
('KRU Replica|Green|XL', 'KRU Replica', 'Green', 'XL', 3000, 5),
('KRU Replica|Green|XXL', 'KRU Replica', 'Green', 'XXL', 3000, 4),
('KRU Replica|Red|M', 'KRU Replica', 'Red', 'M', 3000, 8),
('KRU Replica|Red|L', 'KRU Replica', 'Red', 'L', 3000, 8),

-- Bucket Hats (KES 1000)
('Bucket Hat|Black|None', 'Bucket Hat', 'Black', NULL, 1000, 10),
('Bucket Hat|Beige|None', 'Bucket Hat', 'Beige', NULL, 1000, 10),

-- Tank Tops (KES 1200)
('Tank Top|White|S', 'Tank Top', 'White', 'S', 1200, 5),
('Tank Top|White|M', 'Tank Top', 'White', 'M', 1200, 8),
('Tank Top|White|L', 'Tank Top', 'White', 'L', 1200, 8),
('Tank Top|Black|S', 'Tank Top', 'Black', 'S', 1200, 5),
('Tank Top|Black|M', 'Tank Top', 'Black', 'M', 1200, 8),
('Tank Top|Black|L', 'Tank Top', 'Black', 'L', 1200, 8)
ON CONFLICT (sku) DO UPDATE SET
    category = EXCLUDED.category,
    color = EXCLUDED.color,
    size = EXCLUDED.size,
    price = EXCLUDED.price,
    low_stock_threshold = EXCLUDED.low_stock_threshold;

-- 3. Initial Warehouse Stock-In Movements (SportPesa Supplier Deliveries)
INSERT INTO ledger (type, sku, quantity_delta, location_id, staff_id, amount, notes) VALUES
('StockIn', 'Fan Jersey|White|M', 100, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|White|L', 120, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|White|XL', 80, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|Red|M', 100, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|Red|L', 100, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|Black|M', 80, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Fan Jersey|Black|L', 80, 'wh-main', 'Sarah (Warehouse)', 0, 'SportPesa Supplier Initial Stock-In'),
('StockIn', 'Crew Neck|Navy|M', 60, 'wh-main', 'Sarah (Warehouse)', 0, 'Supplier Batch Intake'),
('StockIn', 'Crew Neck|Navy|L', 60, 'wh-main', 'Sarah (Warehouse)', 0, 'Supplier Batch Intake'),
('StockIn', 'Crew Neck|Black|M', 50, 'wh-main', 'Sarah (Warehouse)', 0, 'Supplier Batch Intake'),
('StockIn', 'Crew Neck|Black|L', 50, 'wh-main', 'Sarah (Warehouse)', 0, 'Supplier Batch Intake'),
('StockIn', 'KRU Replica|Green|M', 40, 'wh-main', 'Sarah (Warehouse)', 0, 'Official KRU Batch'),
('StockIn', 'KRU Replica|Green|L', 40, 'wh-main', 'Sarah (Warehouse)', 0, 'Official KRU Batch'),
('StockIn', 'Bucket Hat|Black|None', 50, 'wh-main', 'Sarah (Warehouse)', 0, 'Accessories Batch'),
('StockIn', 'Bucket Hat|Beige|None', 50, 'wh-main', 'Sarah (Warehouse)', 0, 'Accessories Batch');

-- 4. Initial Stock Transfers to SportPesa 7s Tent (Allocated Event Stock)
-- Paired ledger rows: -N at Main Warehouse, +N at SportPesa 7s
INSERT INTO ledger (type, sku, quantity_delta, location_id, staff_id, amount, notes) VALUES
('Transfer', 'Fan Jersey|White|M', -30, 'wh-main', 'Winston (Admin)', 0, 'Allocated to SportPesa 7s Tent'),
('Transfer', 'Fan Jersey|White|M', 30, 'evt-sp7s', 'Winston (Admin)', 0, 'Received from Warehouse Dispatch'),
('Transfer', 'Fan Jersey|White|L', -35, 'wh-main', 'Winston (Admin)', 0, 'Allocated to SportPesa 7s Tent'),
('Transfer', 'Fan Jersey|White|L', 35, 'evt-sp7s', 'Winston (Admin)', 0, 'Received from Warehouse Dispatch'),
('Transfer', 'Fan Jersey|Red|L', -30, 'wh-main', 'Winston (Admin)', 0, 'Allocated to SportPesa 7s Tent'),
('Transfer', 'Fan Jersey|Red|L', 30, 'evt-sp7s', 'Winston (Admin)', 0, 'Received from Warehouse Dispatch'),
('Transfer', 'Crew Neck|Navy|L', -20, 'wh-main', 'Winston (Admin)', 0, 'Allocated to SportPesa 7s Tent'),
('Transfer', 'Crew Neck|Navy|L', 20, 'evt-sp7s', 'Winston (Admin)', 0, 'Received from Warehouse Dispatch'),
('Transfer', 'KRU Replica|Green|L', -15, 'wh-main', 'Winston (Admin)', 0, 'Allocated to SportPesa 7s Tent'),
('Transfer', 'KRU Replica|Green|L', 15, 'evt-sp7s', 'Winston (Admin)', 0, 'Received from Warehouse Dispatch');
