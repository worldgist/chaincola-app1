-- Add debit_wallet function for debiting user wallets
-- This function is used when users make purchases (buy crypto, buy airtime, etc.)

CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id UUID,
  p_amount DECIMAL(20, 2),
  p_currency TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_balance DECIMAL(20, 2);
BEGIN
  -- Validate currency
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency;
  END IF;

  -- Check current balance from wallets table
  SELECT 
    CASE 
      WHEN p_currency = 'NGN' THEN ngn_balance 
      ELSE usd_balance 
    END INTO v_current_balance
  FROM public.wallets
  WHERE user_id = p_user_id;

  -- If wallet doesn't exist, create it with 0 balance
  IF v_current_balance IS NULL THEN
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
    VALUES (
      p_user_id,
      CASE WHEN p_currency = 'NGN' THEN 0 ELSE 0 END,
      CASE WHEN p_currency = 'USD' THEN 0 ELSE 0 END
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Retry select
    SELECT 
      CASE 
        WHEN p_currency = 'NGN' THEN ngn_balance 
        ELSE usd_balance 
      END INTO v_current_balance
    FROM public.wallets
    WHERE user_id = p_user_id;
  END IF;

  -- Check if sufficient balance
  IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', 
      COALESCE(v_current_balance, 0), p_amount;
  END IF;

  -- Debit from wallets table
  UPDATE public.wallets
  SET
    ngn_balance = CASE 
      WHEN p_currency = 'NGN' THEN ngn_balance - p_amount
      ELSE ngn_balance
    END,
    usd_balance = CASE 
      WHEN p_currency = 'USD' THEN usd_balance - p_amount
      ELSE usd_balance
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Also update wallet_balances table (if exists)
  UPDATE public.wallet_balances
  SET
    balance = balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;

  RETURN TRUE;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, continue with wallets table only
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to debit wallet: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.debit_wallet IS 'Debits a user wallet with the specified amount and currency. Raises exception if insufficient balance.';















