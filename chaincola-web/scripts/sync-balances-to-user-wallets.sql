-- Sync balances from wallet_balances table to user_wallets table
-- This ensures all existing user balances are available in the new unified table

-- Function to sync a user's balances from wallet_balances to user_wallets
CREATE OR REPLACE FUNCTION public.sync_user_wallet_from_balances(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ngn_balance DECIMAL(20, 2) := 0;
  v_btc_balance DECIMAL(20, 8) := 0;
  v_eth_balance DECIMAL(20, 8) := 0;
  v_usdt_balance DECIMAL(20, 8) := 0;
  v_usdc_balance DECIMAL(20, 8) := 0;
  v_xrp_balance DECIMAL(20, 8) := 0;
  v_sol_balance DECIMAL(20, 8) := 0;
BEGIN
  -- Get balances from wallet_balances table
  SELECT COALESCE(MAX(CASE WHEN currency = 'NGN' THEN balance END), 0) INTO v_ngn_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'BTC' THEN balance END), 0) INTO v_btc_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'ETH' THEN balance END), 0) INTO v_eth_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'USDT' THEN balance END), 0) INTO v_usdt_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'USDC' THEN balance END), 0) INTO v_usdc_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'XRP' THEN balance END), 0) INTO v_xrp_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'SOL' THEN balance END), 0) INTO v_sol_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id;

  -- Insert or update user_wallets
  INSERT INTO public.user_wallets (
    user_id,
    ngn_balance,
    btc_balance,
    eth_balance,
    usdt_balance,
    usdc_balance,
    xrp_balance,
    sol_balance
  )
  VALUES (
    p_user_id,
    v_ngn_balance,
    v_btc_balance,
    v_eth_balance,
    v_usdt_balance,
    v_usdc_balance,
    v_xrp_balance,
    v_sol_balance
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    ngn_balance = GREATEST(user_wallets.ngn_balance, v_ngn_balance),
    btc_balance = GREATEST(user_wallets.btc_balance, v_btc_balance),
    eth_balance = GREATEST(user_wallets.eth_balance, v_eth_balance),
    usdt_balance = GREATEST(user_wallets.usdt_balance, v_usdt_balance),
    usdc_balance = GREATEST(user_wallets.usdc_balance, v_usdc_balance),
    xrp_balance = GREATEST(user_wallets.xrp_balance, v_xrp_balance),
    sol_balance = GREATEST(user_wallets.sol_balance, v_sol_balance),
    updated_at = NOW();
END;
$$;

-- Sync all existing users from wallet_balances
DO $$
DECLARE
  v_user_id UUID;
  v_synced_count INTEGER := 0;
BEGIN
  FOR v_user_id IN SELECT DISTINCT user_id FROM public.wallet_balances
  LOOP
    PERFORM public.sync_user_wallet_from_balances(v_user_id);
    v_synced_count := v_synced_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Synced % users from wallet_balances to user_wallets', v_synced_count;
END;
$$;

-- Also sync from wallets table (for NGN balance)
DO $$
DECLARE
  v_user_id UUID;
  v_ngn_balance DECIMAL(20, 2);
BEGIN
  FOR v_user_id, v_ngn_balance IN 
    SELECT user_id, ngn_balance FROM public.wallets WHERE ngn_balance > 0
  LOOP
    INSERT INTO public.user_wallets (user_id, ngn_balance)
    VALUES (v_user_id, v_ngn_balance)
    ON CONFLICT (user_id) DO UPDATE
    SET
      ngn_balance = GREATEST(user_wallets.ngn_balance, v_ngn_balance),
      updated_at = NOW();
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.sync_user_wallet_from_balances(UUID) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION public.sync_user_wallet_from_balances IS 'Syncs user balances from wallet_balances table to user_wallets table. Uses GREATEST to preserve maximum balance.';
