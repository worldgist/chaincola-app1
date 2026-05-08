-- Ensure wallet_balances always use correct auth.users.id
-- This migration creates a trigger to automatically fix any wallet_balances
-- that reference user_profiles.id instead of auth.users.id

-- Create a function to get the correct user_id from user_profiles
CREATE OR REPLACE FUNCTION public.get_correct_user_id(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_correct_user_id UUID;
BEGIN
  -- First check if it's already a valid auth.users.id
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN p_user_id;
  END IF;
  
  -- If not, try to find the correct user_id from user_profiles
  SELECT user_id INTO v_correct_user_id
  FROM public.user_profiles
  WHERE id = p_user_id
  LIMIT 1;
  
  -- If found, return it; otherwise return original (will cause FK error which is expected)
  RETURN COALESCE(v_correct_user_id, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger function to ensure wallet_balances uses correct user_id
CREATE OR REPLACE FUNCTION public.ensure_wallet_balance_correct_user_id()
RETURNS TRIGGER AS $$
DECLARE
  v_correct_user_id UUID;
BEGIN
  -- Get the correct user_id
  v_correct_user_id := public.get_correct_user_id(NEW.user_id);
  
  -- If user_id needs to be corrected
  IF v_correct_user_id != NEW.user_id THEN
    -- Check if balance already exists for correct user_id
    IF EXISTS (
      SELECT 1 FROM public.wallet_balances
      WHERE user_id = v_correct_user_id
        AND currency = NEW.currency
    ) THEN
      -- Merge balances
      UPDATE public.wallet_balances
      SET 
        balance = balance + NEW.balance,
        locked = locked + NEW.locked,
        updated_at = NOW()
      WHERE user_id = v_correct_user_id
        AND currency = NEW.currency;
      
      -- Prevent insert (balance merged)
      RETURN NULL;
    ELSE
      -- Update user_id to correct value
      NEW.user_id := v_correct_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS ensure_wallet_balance_correct_user_id_trigger ON public.wallet_balances;

-- Create trigger
CREATE TRIGGER ensure_wallet_balance_correct_user_id_trigger
  BEFORE INSERT OR UPDATE ON public.wallet_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_wallet_balance_correct_user_id();

-- Also create a function to fix existing wallet_balances
CREATE OR REPLACE FUNCTION public.fix_wallet_balances_user_ids()
RETURNS TABLE(
  fixed_count INTEGER,
  merged_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  v_fixed INTEGER := 0;
  v_merged INTEGER := 0;
  v_errors INTEGER := 0;
  rec RECORD;
  v_correct_user_id UUID;
BEGIN
  -- Find all wallet_balances that don't have matching auth.users
  FOR rec IN 
    SELECT DISTINCT wb.user_id, wb.currency
    FROM public.wallet_balances wb
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = wb.user_id
    )
  LOOP
    BEGIN
      -- Get correct user_id
      v_correct_user_id := public.get_correct_user_id(rec.user_id);
      
      IF v_correct_user_id != rec.user_id THEN
        -- Check if balance exists for correct user_id
        IF EXISTS (
          SELECT 1 FROM public.wallet_balances
          WHERE user_id = v_correct_user_id
            AND currency = rec.currency
        ) THEN
          -- Merge balances
          UPDATE public.wallet_balances wb_target
          SET 
            balance = wb_target.balance + (
              SELECT balance FROM public.wallet_balances
              WHERE user_id = rec.user_id AND currency = rec.currency
            ),
            locked = wb_target.locked + (
              SELECT locked FROM public.wallet_balances
              WHERE user_id = rec.user_id AND currency = rec.currency
            ),
            updated_at = NOW()
          WHERE user_id = v_correct_user_id
            AND currency = rec.currency;
          
          -- Delete old record
          DELETE FROM public.wallet_balances
          WHERE user_id = rec.user_id
            AND currency = rec.currency;
          
          v_merged := v_merged + 1;
        ELSE
          -- Update user_id
          UPDATE public.wallet_balances
          SET user_id = v_correct_user_id
          WHERE user_id = rec.user_id
            AND currency = rec.currency;
          
          v_fixed := v_fixed + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'Error fixing wallet_balance for user_id %: %', rec.user_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_fixed, v_merged, v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fix_wallet_balances_user_ids IS 'Fix all wallet_balances that reference incorrect user_ids';

-- Run the fix function
SELECT * FROM public.fix_wallet_balances_user_ids();









