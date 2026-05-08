-- Grant full admin (is_admin + role admin) to worldgist72@gmail.com
-- User must already exist in auth.users (sign up once in the app first).

DO $$
DECLARE
  target_email TEXT := 'worldgist72@gmail.com';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = target_email) THEN
    PERFORM public.grant_admin_access(target_email);
    RAISE NOTICE 'Admin access granted to %', target_email;
  ELSE
    RAISE NOTICE 'User % does not exist in auth.users; sign up first, then run grant_admin_access in SQL Editor.', target_email;
  END IF;
END $$;
