-- Fix infinite recursion in RLS policies
-- The issue is that policies check if user is admin by querying user_profiles,
-- which triggers the same policy again, creating infinite recursion

-- Drop all existing policies that might cause recursion
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Policy 1: Users can ALWAYS view their own profile
-- This is simple and doesn't cause recursion
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Admins can view all profiles
-- Use a function to check admin status to avoid recursion
-- The function uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_user_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- This function bypasses RLS (SECURITY DEFINER)
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE user_id = check_user_id 
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Now create the admin policy using the function
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    public.is_user_admin(auth.uid())
  );

-- Policy 5: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id OR 
    public.is_user_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id OR 
    public.is_user_admin(auth.uid())
  );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO anon;

-- Add comment
COMMENT ON FUNCTION public.is_user_admin IS 'Checks if a user is an admin. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';



















