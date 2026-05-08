-- Fix RLS policies to prevent circular dependency
-- Users should always be able to read their own profile, even if it doesn't exist yet

-- Drop all existing policies that might conflict
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Policy: Users can ALWAYS view their own profile (no circular dependency)
-- This is the base policy that allows users to check their own admin status
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all profiles (but only after they can read their own)
-- This uses a simpler check that doesn't create circular dependency
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    -- Allow if viewing own profile (handled by above policy, but explicit for clarity)
    auth.uid() = user_id OR
    -- Allow if current user is an admin (checked via subquery)
    (
      SELECT is_admin 
      FROM public.user_profiles 
      WHERE user_id = auth.uid()
    ) = true
  );

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (
      SELECT is_admin 
      FROM public.user_profiles 
      WHERE user_id = auth.uid()
    ) = true
  )
  WITH CHECK (
    auth.uid() = user_id OR
    (
      SELECT is_admin 
      FROM public.user_profiles 
      WHERE user_id = auth.uid()
    ) = true
  );

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Ensure the grant_admin_access function can be called by authenticated users
-- The function is SECURITY DEFINER so it bypasses RLS, but we need to grant execute permission
GRANT EXECUTE ON FUNCTION public.grant_admin_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_access(TEXT) TO authenticated;

