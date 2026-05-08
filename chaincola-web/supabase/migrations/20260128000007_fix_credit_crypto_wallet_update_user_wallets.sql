-- Fix credit_crypto_wallet function to update BOTH wallet_balances AND user_wallets
-- This ensures SOL deposits (and other crypto deposits) are visible in the app
-- since getUserCryptoBalances prioritizes user_wallets over wallet_balances

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

  -- Get current balance from wallet_balances
  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_currency;

  -- Calculate new balance
  IF v_current_balance IS NULL THEN
    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_current_balance + p_amount;
  END IF;

  -- 1. Update wallet_balances table
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, p_currency, v_new_balance)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();

  -- 2. Update user_wallets table (CRITICAL - this is what the app reads)
  -- Ensure user_wallets record exists
  INSERT INTO public.user_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update the specific crypto balance in user_wallets
  UPDATE public.user_wallets
  SET
    btc_balance = CASE WHEN p_currency = 'BTC' THEN COALESCE(btc_balance, 0) + p_amount ELSE btc_balance END,
    eth_balance = CASE WHEN p_currency = 'ETH' THEN COALESCE(eth_balance, 0) + p_amount ELSE eth_balance END,
    usdt_balance = CASE WHEN p_currency = 'USDT' THEN COALESCE(usdt_balance, 0) + p_amount ELSE usdt_balance END,
    usdc_balance = CASE WHEN p_currency = 'USDC' THEN COALESCE(usdc_balance, 0) + p_amount ELSE usdc_balance END,
    xrp_balance = CASE WHEN p_currency = 'XRP' THEN COALESCE(xrp_balance, 0) + p_amount ELSE xrp_balance END,
    sol_balance = CASE WHEN p_currency = 'SOL' THEN COALESCE(sol_balance, 0) + p_amount ELSE sol_balance END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log the credit operation
  RAISE NOTICE 'Credited % % to user %. New balance: %', p_amount, p_currency, p_user_id, v_new_balance;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.credit_crypto_wallet IS 'Credits a user''s crypto wallet balance. Updates BOTH wallet_balances AND user_wallets tables to ensure balances are visible in the app.';
