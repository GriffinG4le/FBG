-- ==============================================================================
-- Migration: Add User Authentication, Hashed Passwords, and Default Griffin Account
-- ==============================================================================

-- 1. Add username, pin, and must_change_pin columns
ALTER TABLE IF EXISTS staff_profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE IF EXISTS staff_profiles ADD COLUMN IF NOT EXISTS pin text;
ALTER TABLE IF EXISTS staff_profiles ADD COLUMN IF NOT EXISTS must_change_pin boolean DEFAULT true;

-- 2. Update role check constraint to support 'superadmin'
ALTER TABLE IF EXISTS staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
ALTER TABLE IF EXISTS staff_profiles ADD CONSTRAINT staff_profiles_role_check CHECK (role IN ('superadmin', 'admin', 'warehouse', 'event_staff'));

-- 3. Remove legacy dummy accounts and establish Griffin Superadmin account with hashed default password
DELETE FROM staff_profiles WHERE id IN ('st-jane', 'st-kelvin', 'st-sarah', 'st-winston');

INSERT INTO staff_profiles (id, name, username, pin, must_change_pin, role, assigned_location_ids) VALUES
    ('usr-griffin', 'Griffin', 'griffin', encode(sha256(('fbg_secure_salt_2026_v1:griffin@2026')::bytea), 'hex'), true, 'superadmin', ARRAY['*'])
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    assigned_location_ids = EXCLUDED.assigned_location_ids;
