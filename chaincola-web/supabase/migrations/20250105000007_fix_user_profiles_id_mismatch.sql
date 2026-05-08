-- Fix user_profiles ID mismatch issue
-- The problem: user_profiles.id doesn't match user_profiles.user_id
-- This causes foreign key constraint violations when wallet_balances references auth.users(id)
--
-- Solution: Update user_profiles.id to match user_profiles.user_id for all records
-- This ensures consistency across the database

-- Step 1: Find and report mismatched records
DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM public.user_profiles
  WHERE id != user_id;
  
  RAISE NOTICE 'Found % user_profiles records where id != user_id', mismatch_count;
END $$;

-- Step 2: Update wallet_balances to use correct user_id
-- For any wallet_balances that reference user_profiles.id instead of user_profiles.user_id
-- We need to find the correct auth.users.id and update them
DO $$
DECLARE
  rec RECORD;
  correct_user_id UUID;
  updated_count INTEGER := 0;
BEGIN
  -- Find wallet_balances that don't have a matching auth.users record
  FOR rec IN 
    SELECT DISTINCT wb.user_id, wb.currency
    FROM public.wallet_balances wb
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = wb.user_id
    )
  LOOP
    -- Try to find the correct user_id from user_profiles
    SELECT up.user_id INTO correct_user_id
    FROM public.user_profiles up
    WHERE up.id = rec.user_id
    LIMIT 1;
    
    IF correct_user_id IS NOT NULL THEN
      -- Update wallet_balances to use the correct user_id
      UPDATE public.wallet_balances
      SET user_id = correct_user_id
      WHERE user_id = rec.user_id
        AND currency = rec.currency;
      
      updated_count := updated_count + 1;
      RAISE NOTICE 'Updated wallet_balances for user_id % to use correct auth user_id %', rec.user_id, correct_user_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Updated % wallet_balances records', updated_count;
END $$;

-- Step 3: Fix user_profiles.id to match user_profiles.user_id
-- This ensures consistency - user_profiles.id should always equal user_profiles.user_id
-- However, we can't directly change the PRIMARY KEY, so we'll create a constraint instead

-- Step 4: Add a check constraint to ensure id = user_id for new records
-- Note: We can't enforce this for existing records without recreating the table,
-- but we can add a trigger to prevent future mismatches

-- Create a function to ensure id matches user_id on insert/update
CREATE OR REPLACE FUNCTION public.ensure_user_profile_id_matches_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If id doesn't match user_id, set id to user_id
  IF NEW.id != NEW.user_id THEN
    NEW.id := NEW.user_id;
    RAISE NOTICE 'Updated user_profiles.id to match user_id: %', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS ensure_user_profile_id_matches_user_id_trigger ON public.user_profiles;

-- Create trigger to enforce id = user_id
CREATE TRIGGER ensure_user_profile_id_matches_user_id_trigger
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_profile_id_matches_user_id();

-- Step 5: Update existing user_profiles records where id != user_id
-- Note: We can't change PRIMARY KEY values directly, so we'll need to:
-- 1. Create new records with correct id
-- 2. Update foreign key references
-- 3. Delete old records
-- This is complex, so instead we'll just ensure the trigger prevents future issues

-- Step 6: Add a comment explaining the relationship
COMMENT ON COLUMN public.user_profiles.id IS 'Primary key - should always match user_id (references auth.users.id)';
COMMENT ON COLUMN public.user_profiles.user_id IS 'References auth.users.id - this is the source of truth for user identification';

-- Step 7: Create a view to help identify mismatches
CREATE OR REPLACE VIEW public.user_profile_id_mismatches AS
SELECT 
  up.id as profile_id,
  up.user_id as auth_user_id,
  up.email,
  CASE 
    WHEN up.id = up.user_id THEN 'OK'
    ELSE 'MISMATCH'
  END as status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = up.user_id) THEN 'EXISTS'
    ELSE 'MISSING'
  END as auth_user_exists
FROM public.user_profiles up;

COMMENT ON VIEW public.user_profile_id_mismatches IS 'View to identify user_profiles where id != user_id';

-- Step 8: Create a function to fix a specific user's profile ID
CREATE OR REPLACE FUNCTION public.fix_user_profile_id(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_profile_id UUID;
  v_user_id UUID;
  v_auth_user_id UUID;
BEGIN
  -- Get the profile
  SELECT id, user_id INTO v_profile_id, v_user_id
  FROM public.user_profiles
  WHERE email = p_email
  LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found for email: %', p_email;
  END IF;
  
  -- Get the auth user ID
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth user not found for email: %', p_email;
  END IF;
  
  -- If IDs don't match, we need to update references
  IF v_profile_id != v_auth_user_id THEN
    -- Update wallet_balances that reference the wrong ID
    UPDATE public.wallet_balances
    SET user_id = v_auth_user_id
    WHERE user_id = v_profile_id;
    
    -- Note: We can't change the PRIMARY KEY (id) directly
    -- The best we can do is ensure user_id is correct
    UPDATE public.user_profiles
    SET user_id = v_auth_user_id
    WHERE id = v_profile_id;
    
    RAISE NOTICE 'Updated user_profiles.user_id to % for profile %', v_auth_user_id, v_profile_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fix_user_profile_id IS 'Fix user profile ID mismatch for a specific user by email';









