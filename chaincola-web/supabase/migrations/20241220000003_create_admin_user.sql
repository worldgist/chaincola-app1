-- Create admin user and grant admin privileges
-- This migration creates the admin user if they don't exist and grants admin access

DO $$
DECLARE
  admin_email TEXT := 'chaincolawallet@gmail.com';
  admin_password TEXT := 'Salifu147@';
  admin_user_id UUID;
  user_exists BOOLEAN;
BEGIN
  -- Check if user already exists
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = admin_email) INTO user_exists;
  
  IF NOT user_exists THEN
    -- Create the admin user in auth.users
    -- Note: This requires using Supabase Auth API or Dashboard
    -- For now, we'll just grant admin access if the user exists
    RAISE NOTICE 'User % does not exist. Please create the user first through Supabase Auth, then run: SELECT public.grant_admin_access(''%'');', admin_email, admin_email;
  ELSE
    -- Get the user ID
    SELECT id INTO admin_user_id FROM auth.users WHERE email = admin_email;
    
    -- Grant admin access
    PERFORM public.grant_admin_access(admin_email);
    
    RAISE NOTICE 'Admin access granted to user: %', admin_email;
  END IF;
END $$;

-- Alternative: If user already exists, just grant admin access
-- Uncomment and run this if the user is already created:
-- SELECT public.grant_admin_access('chaincolawallet@gmail.com');



















