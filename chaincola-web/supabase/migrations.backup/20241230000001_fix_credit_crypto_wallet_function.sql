-- Fix credit_crypto_wallet function
-- The previous version incorrectly tried to cast DECIMAL balance to TEXT
-- This fixes the function to work correctly with DECIMAL(20, 8) balance column

CREATE OR REPLACE FUNCTION public.credit_crypto_wallet(
  p_user_id UUID,
  p_amount DECIMAL,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance DECIMAL(20, 8);
  v_new_balance DECIMAL(20, 8);
BEGIN
  -- Validate currency
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Get current balance
  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_currency;

  -- Calculate new balance
  IF v_current_balance IS NULL THEN
    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_current_balance + p_amount;
  END IF;

  -- Insert or update wallet balance
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, p_currency, v_new_balance)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();

  -- Log the credit operation
  RAISE NOTICE 'Credited % % to user %. New balance: %', p_amount, p_currency, p_user_id, v_new_balance;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.credit_crypto_wallet IS 'Credits a user''s crypto wallet balance. Used by deposit monitoring functions.';

