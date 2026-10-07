-- ==============================================================================
-- Migration: Add ID Defaults, Staff Profiles, and Update Check Constraints
-- ==============================================================================

-- 1. Ensure uuid-ossp or pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update default IDs for all primary tables
ALTER TABLE IF EXISTS locations ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE IF EXISTS orders ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE IF EXISTS fulfillments ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE IF EXISTS ledger ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE IF EXISTS event_transfers ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 3. Update Check Constraints for ledger.type and orders.status
ALTER TABLE IF EXISTS ledger DROP CONSTRAINT IF EXISTS ledger_type_check;
ALTER TABLE IF EXISTS ledger ADD CONSTRAINT ledger_type_check CHECK (type IN ('StockIn', 'Transfer', 'Dispatch', 'Swap', 'Refund', 'Correction'));

ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE IF EXISTS orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'fulfilled', 'swapped', 'refunded', 'cancelled'));

-- 4. Create Staff Profiles table if not exists
CREATE TABLE IF NOT EXISTS staff_profiles (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'warehouse', 'event_staff')),
    assigned_location_ids text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all staff_profiles" ON staff_profiles FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed standard staff members
INSERT INTO staff_profiles (id, name, role, assigned_location_ids) VALUES
    ('st-jane', 'Jane Wambui', 'event_staff', ARRAY['evt-driftwood', 'evt-sp7s']),
    ('st-kelvin', 'Kelvin Ochieng', 'event_staff', ARRAY['evt-sp7s']),
    ('st-sarah', 'Sarah (Warehouse Lead)', 'warehouse', ARRAY['wh-main']),
    ('st-winston', 'Winston (Admin)', 'admin', ARRAY['wh-main', 'evt-sp7s', 'evt-driftwood'])
ON CONFLICT (id) DO NOTHING;
