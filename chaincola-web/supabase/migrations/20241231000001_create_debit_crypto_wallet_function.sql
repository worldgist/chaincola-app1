-- Create function to debit crypto wallet balance
-- Used when users sell crypto or send crypto

CREATE OR REPLACE FUNCTION public.debit_crypto_wallet(
  p_user_id UUID,
  p_amount DECIMAL,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance DECIMAL;
BEGIN
  -- Validate currency
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  -- Check current balance
  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_currency;

  -- Check if sufficient balance
  IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', 
      COALESCE(v_current_balance, 0), p_amount;
  END IF;

  -- Debit wallet balance
  UPDATE public.wallet_balances
  SET
    balance = balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.debit_crypto_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.debit_crypto_wallet IS 'Debits a user''s crypto wallet balance. Used when selling or sending crypto. Raises exception if insufficient balance.';












