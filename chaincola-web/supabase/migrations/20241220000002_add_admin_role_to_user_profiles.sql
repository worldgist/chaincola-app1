-- Add admin role and permissions to user_profiles table

-- Add is_admin column to track admin users
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Add role column for more granular permissions (optional, for future use)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;

-- Add index on is_admin for faster admin queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin 
ON public.user_profiles(is_admin) 
WHERE is_admin = true;

-- Add index on role for faster role-based queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role 
ON public.user_profiles(role);

-- Add comment to columns
COMMENT ON COLUMN public.user_profiles.is_admin IS 'Whether the user has admin privileges';
COMMENT ON COLUMN public.user_profiles.role IS 'User role: user, admin, moderator, etc.';

-- Update RLS policies to allow admins to view all profiles
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;

-- Policy: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE user_id = auth.uid() 
      AND is_admin = true
    )
  );

-- Policy: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE user_id = auth.uid() 
      AND is_admin = true
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE user_id = auth.uid() 
      AND is_admin = true
    )
  );

-- Function to grant admin access to a user by email
CREATE OR REPLACE FUNCTION public.grant_admin_access(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Find user by email in auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Update user_profiles to grant admin access
  UPDATE public.user_profiles
  SET 
    is_admin = true,
    role = 'admin',
    updated_at = NOW()
  WHERE user_id = target_user_id;
  
  -- If profile doesn't exist, create it with admin privileges
  IF NOT FOUND THEN
    INSERT INTO public.user_profiles (
      user_id,
      email,
      is_admin,
      role,
      full_name
    )
    SELECT 
      target_user_id,
      user_email,
      true,
      'admin',
      COALESCE(
        (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = target_user_id),
        user_email
      )
    ON CONFLICT (user_id) DO UPDATE
    SET 
      is_admin = true,
      role = 'admin',
      updated_at = NOW();
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke admin access
CREATE OR REPLACE FUNCTION public.revoke_admin_access(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Revoke admin access
  UPDATE public.user_profiles
  SET 
    is_admin = false,
    role = 'user',
    updated_at = NOW()
  WHERE user_id = target_user_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to functions
COMMENT ON FUNCTION public.grant_admin_access IS 'Grants admin privileges to a user by email';
COMMENT ON FUNCTION public.revoke_admin_access IS 'Revokes admin privileges from a user by email';

-- Used by RLS policies in later migrations (avoids missing-function errors on push).
CREATE OR REPLACE FUNCTION public.is_user_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE user_id = check_user_id
      AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO anon;

COMMENT ON FUNCTION public.is_user_admin IS
  'Returns true if user_profiles marks this user as admin. SECURITY DEFINER to avoid RLS recursion.';



















