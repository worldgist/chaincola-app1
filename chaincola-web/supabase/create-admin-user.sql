-- Script to create admin user and grant privileges
-- Run this in Supabase SQL Editor after creating the user through Auth

-- Step 1: Create the user through Supabase Auth Dashboard first
-- Go to: Authentication > Users > Add User
-- Email: chaincolawallet@gmail.com
-- Password: Salifu147@
-- Auto Confirm User: Yes

-- Step 2: After user is created, run this to grant admin access:
SELECT public.grant_admin_access('chaincolawallet@gmail.com');

-- Verify admin access was granted:
SELECT 
  up.user_id,
  up.email,
  up.full_name,
  up.is_admin,
  up.role,
  au.email_confirmed_at,
  au.created_at
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.user_id
WHERE up.email = 'chaincolawallet@gmail.com';

-- If you need to revoke admin access later:
-- SELECT public.revoke_admin_access('chaincolawallet@gmail.com');



















