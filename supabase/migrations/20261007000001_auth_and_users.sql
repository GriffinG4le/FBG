-- ==============================================================================
-- Migration: Add User Authentication, Superadmin Role, and Default Griffin Account
-- ==============================================================================

-- 1. Add username and pin columns
ALTER TABLE IF EXISTS staff_profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE IF EXISTS staff_profiles ADD COLUMN IF NOT EXISTS pin text DEFAULT '1234';

-- 2. Update role check constraint to support 'superadmin'
ALTER TABLE IF EXISTS staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
ALTER TABLE IF EXISTS staff_profiles ADD CONSTRAINT staff_profiles_role_check CHECK (role IN ('superadmin', 'admin', 'warehouse', 'event_staff'));

-- 3. Remove dummy demo accounts and establish Griffin Superadmin account
DELETE FROM staff_profiles WHERE id IN ('st-jane', 'st-kelvin', 'st-sarah', 'st-winston');

INSERT INTO staff_profiles (id, name, username, pin, role, assigned_location_ids) VALUES
    ('usr-griffin', 'Griffin', 'griffin', '1234', 'superadmin', ARRAY['*'])
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    assigned_location_ids = EXCLUDED.assigned_location_ids;
