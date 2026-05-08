-- Create function to credit crypto wallet balance
-- Used by deposit monitoring to credit user balances after on-chain confirmation

-- Drop existing function if it exists (to handle return type change)
DROP FUNCTION IF EXISTS public.credit_crypto_wallet(UUID, DECIMAL, TEXT);

CREATE FUNCTION public.credit_crypto_wallet(
  p_user_id UUID,
  p_amount DECIMAL,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate currency
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  -- Insert or update wallet balance
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, p_currency, p_amount)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    balance = wallet_balances.balance + p_amount,
    updated_at = NOW();
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.credit_crypto_wallet IS 'Credits a user''s crypto wallet balance. Used by deposit monitoring functions.';

