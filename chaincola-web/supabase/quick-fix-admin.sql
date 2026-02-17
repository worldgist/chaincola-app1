-- Quick Fix: Create/Update Admin Profile
-- Run this in Supabase SQL Editor if you're getting "Error checking admin privileges"

-- Option 1: Use the RPC function (Recommended)
SELECT public.grant_admin_access('chaincolawallet@gmail.com');

-- Option 2: Direct insert/update (if RPC doesn't work)
INSERT INTO public.user_profiles (
  user_id,
  email,
  full_name,
  is_admin,
  role,
  referral_code
)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  true,
  'admin',
  UPPER(SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 7))
FROM auth.users
WHERE email = 'chaincolawallet@gmail.com'
ON CONFLICT (user_id) DO UPDATE
SET 
  is_admin = true,
  role = 'admin',
  email = EXCLUDED.email,
  updated_at = NOW();

-- Verify it worked
SELECT 
  up.user_id,
  up.email,
  up.full_name,
  up.is_admin,
  up.role
FROM public.user_profiles up
WHERE up.email = 'chaincolawallet@gmail.com';



















