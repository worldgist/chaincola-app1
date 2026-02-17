-- Fix admin user profile if it doesn't exist
-- Run this in Supabase SQL Editor if the admin user profile is missing

-- Step 1: Check if user exists in auth.users
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'chaincolawallet@gmail.com';

-- Step 2: Create or update admin profile
-- This will create the profile if it doesn't exist, or update it if it does
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
  true,  -- is_admin
  'admin',  -- role
  UPPER(SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 7))  -- Generate referral code
FROM auth.users
WHERE email = 'chaincolawallet@gmail.com'
ON CONFLICT (user_id) DO UPDATE
SET 
  is_admin = true,
  role = 'admin',
  email = EXCLUDED.email,
  updated_at = NOW();

-- Step 3: Verify the profile was created/updated
SELECT 
  up.user_id,
  up.email,
  up.full_name,
  up.is_admin,
  up.role,
  up.referral_code,
  au.email_confirmed_at,
  au.created_at as user_created_at,
  up.created_at as profile_created_at,
  up.updated_at as profile_updated_at
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.user_id
WHERE up.email = 'chaincolawallet@gmail.com';

-- Alternative: Use the grant_admin_access function
-- SELECT public.grant_admin_access('chaincolawallet@gmail.com');



















