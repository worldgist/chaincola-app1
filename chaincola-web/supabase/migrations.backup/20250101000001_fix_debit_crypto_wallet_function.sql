-- Fix debit_crypto_wallet function
-- Add SET search_path and improve error handling to match credit_crypto_wallet

CREATE OR REPLACE FUNCTION public.debit_crypto_wallet(
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

  -- Check if sufficient balance
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance. No balance record found for user % and currency %', p_user_id, p_currency;
  END IF;

  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', 
      v_current_balance, p_amount;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Update wallet balance
  UPDATE public.wallet_balances
  SET
    balance = v_new_balance,
    updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;

  -- Verify update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update balance. No balance record found for user % and currency %', p_user_id, p_currency;
  END IF;

  -- Log the debit operation
  RAISE NOTICE 'Debited % % from user %. New balance: %', p_amount, p_currency, p_user_id, v_new_balance;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.debit_crypto_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.debit_crypto_wallet IS 'Debits a user''s crypto wallet balance. Used when selling or sending crypto. Raises exception if insufficient balance.';











