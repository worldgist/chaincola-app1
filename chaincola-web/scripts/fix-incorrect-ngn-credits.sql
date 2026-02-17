-- Fix Incorrect NGN Credits from Instant Sell
-- This script identifies and fixes transactions where users were over-credited NGN
-- due to the instant_sell_crypto_v2 balance calculation bug

-- Step 1: Verify the fix is applied
-- Check if the function has the correct logic (using user_wallets as primary source)
DO $$
BEGIN
  -- Check function comment to verify fix
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_description d ON p.oid = d.objoid
    WHERE p.proname = 'instant_sell_crypto_v2'
    AND d.description LIKE '%PRIMARY SOURCE OF TRUTH%'
  ) THEN
    RAISE NOTICE '⚠️  WARNING: The fix may not be applied. Please run migration 20260129000001_fix_instant_sell_ngn_balance_calculation.sql';
  ELSE
    RAISE NOTICE '✅ Fix appears to be applied';
  END IF;
END $$;

-- Step 2: Find potentially affected transactions
-- Look for transactions where the credited amount seems incorrect
-- (This is a diagnostic query - review results before taking action)

CREATE OR REPLACE FUNCTION find_incorrect_ngn_credits()
RETURNS TABLE(
  transaction_id UUID,
  user_id UUID,
  crypto_amount DECIMAL(20, 8),
  fiat_amount DECIMAL(20, 2),
  rate DECIMAL(20, 2),
  expected_amount DECIMAL(20, 2),
  difference DECIMAL(20, 2),
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS transaction_id,
    t.user_id,
    t.crypto_amount::DECIMAL(20, 8),
    t.fiat_amount::DECIMAL(20, 2),
    COALESCE((t.metadata->>'rate')::DECIMAL(20, 2), 0) AS rate,
    -- Calculate expected amount: (crypto_amount * rate) * (1 - fee_percentage)
    -- Default fee is 1% (0.01)
    ((t.crypto_amount::DECIMAL(20, 8) * COALESCE((t.metadata->>'rate')::DECIMAL(20, 2), 0)) * (1 - COALESCE((t.metadata->>'fee_percentage')::DECIMAL(5, 4), 0.01)))::DECIMAL(20, 2) AS expected_amount,
    -- Difference between credited and expected
    (t.fiat_amount::DECIMAL(20, 2) - 
     ((t.crypto_amount::DECIMAL(20, 8) * COALESCE((t.metadata->>'rate')::DECIMAL(20, 2), 0)) * (1 - COALESCE((t.metadata->>'fee_percentage')::DECIMAL(5, 4), 0.01)))::DECIMAL(20, 2)
    )::DECIMAL(20, 2) AS difference,
    t.created_at
  FROM public.transactions t
  WHERE t.transaction_type = 'SELL'
    AND t.crypto_currency = 'SOL'
    AND t.status = 'COMPLETED'
    AND t.fiat_currency = 'NGN'
    AND t.fiat_amount IS NOT NULL
    AND t.metadata->>'instant_sell' = 'true'
    AND t.metadata->>'rate' IS NOT NULL
    -- Flag transactions where credited amount is significantly different from expected
    -- (more than 10% difference or absolute difference > 1000)
    AND ABS(
      t.fiat_amount::DECIMAL(20, 2) - 
      ((t.crypto_amount::DECIMAL(20, 8) * (t.metadata->>'rate')::DECIMAL(20, 2)) * (1 - COALESCE((t.metadata->>'fee_percentage')::DECIMAL(5, 4), 0.01)))::DECIMAL(20, 2)
    ) > GREATEST(
      ((t.crypto_amount::DECIMAL(20, 8) * (t.metadata->>'rate')::DECIMAL(20, 2)) * (1 - COALESCE((t.metadata->>'fee_percentage')::DECIMAL(5, 4), 0.01)))::DECIMAL(20, 2) * 0.1,
      1000
    )
  ORDER BY t.created_at DESC;
END;
$$;

-- Step 3: Review potentially affected transactions
-- Run this to see transactions that might have incorrect credits
SELECT * FROM find_incorrect_ngn_credits();

-- Step 4: Calculate correct balance for a specific user
-- Replace USER_ID_HERE with the actual user_id
CREATE OR REPLACE FUNCTION calculate_correct_user_balance(p_user_id UUID)
RETURNS TABLE(
  current_balance_user_wallets DECIMAL(20, 2),
  current_balance_wallet_balances DECIMAL(20, 2),
  current_balance_wallets DECIMAL(20, 2),
  total_incorrect_credit DECIMAL(20, 2),
  correct_balance DECIMAL(20, 2)
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_wallet_balance DECIMAL(20, 2);
  v_wallet_balances_balance DECIMAL(20, 2);
  v_wallets_balance DECIMAL(20, 2);
  v_total_incorrect DECIMAL(20, 2) := 0;
  v_correct_balance DECIMAL(20, 2);
BEGIN
  -- Get current balances
  SELECT COALESCE(ngn_balance, 0) INTO v_user_wallet_balance
  FROM public.user_wallets WHERE user_id = p_user_id;
  
  SELECT COALESCE(balance, 0) INTO v_wallet_balances_balance
  FROM public.wallet_balances WHERE user_id = p_user_id AND currency = 'NGN';
  
  SELECT COALESCE(ngn_balance, 0) INTO v_wallets_balance
  FROM public.wallets WHERE user_id = p_user_id;
  
  -- Calculate total incorrect credit from affected transactions
  SELECT COALESCE(SUM(difference), 0) INTO v_total_incorrect
  FROM find_incorrect_ngn_credits()
  WHERE find_incorrect_ngn_credits.user_id = p_user_id;
  
  -- Correct balance should be user_wallets balance minus incorrect credits
  v_correct_balance := v_user_wallet_balance - v_total_incorrect;
  
  RETURN QUERY SELECT 
    v_user_wallet_balance,
    v_wallet_balances_balance,
    v_wallets_balance,
    v_total_incorrect,
    v_correct_balance;
END;
$$;

-- Step 5: Fix balance for a specific user (USE WITH CAUTION!)
-- This will correct the balance by subtracting the over-credited amount
-- Replace USER_ID_HERE with the actual user_id
-- REVIEW THE CALCULATION BEFORE RUNNING!

/*
DO $$
DECLARE
  v_user_id UUID := 'USER_ID_HERE'::UUID;
  v_current_balance DECIMAL(20, 2);
  v_incorrect_credit DECIMAL(20, 2);
  v_correct_balance DECIMAL(20, 2);
BEGIN
  -- Get current balance and incorrect credit amount
  SELECT 
    current_balance_user_wallets,
    total_incorrect_credit,
    correct_balance
  INTO 
    v_current_balance,
    v_incorrect_credit,
    v_correct_balance
  FROM calculate_correct_user_balance(v_user_id);
  
  IF v_incorrect_credit > 0 THEN
    RAISE NOTICE 'Current balance: ₦%', v_current_balance;
    RAISE NOTICE 'Incorrect credit: ₦%', v_incorrect_credit;
    RAISE NOTICE 'Correct balance: ₦%', v_correct_balance;
    
    -- Update user_wallets
    UPDATE public.user_wallets
    SET ngn_balance = v_correct_balance,
        updated_at = NOW()
    WHERE user_id = v_user_id;
    
    -- Update wallet_balances
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (v_user_id, 'NGN', v_correct_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_correct_balance, updated_at = NOW();
    
    -- Update wallets
    INSERT INTO public.wallets (user_id, ngn_balance, updated_at)
    VALUES (v_user_id, v_correct_balance, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = v_correct_balance, updated_at = NOW();
    
    RAISE NOTICE '✅ Balance corrected for user %', v_user_id;
  ELSE
    RAISE NOTICE 'No incorrect credits found for user %', v_user_id;
  END IF;
END $$;
*/

-- Step 6: Create audit log entry for corrections
CREATE TABLE IF NOT EXISTS public.balance_corrections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id),
  correction_type TEXT NOT NULL, -- 'OVER_CREDIT', 'UNDER_CREDIT', etc.
  amount_before DECIMAL(20, 2) NOT NULL,
  amount_after DECIMAL(20, 2) NOT NULL,
  correction_amount DECIMAL(20, 2) NOT NULL,
  reason TEXT,
  corrected_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_balance_corrections_user_id ON public.balance_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_corrections_created_at ON public.balance_corrections(created_at DESC);
