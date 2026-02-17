-- Fix instant_sell_crypto_v2 NGN balance calculation bug
-- Issue: Function was using GREATEST() to find maximum balance from all tables,
--        then adding new amount, causing users to be credited with wrong amounts.
--        Example: User sold 0.04352878 SOL worth ₦7,913.90 but was credited ₦392,497.26
--        because it took existing balance (₦384,583.36) and added new amount.
-- Fix: Use user_wallets.ngn_balance as PRIMARY source of truth, only check other
--      tables if user_wallets balance is NULL or 0 (same pattern as instant_buy_crypto)

CREATE OR REPLACE FUNCTION public.instant_sell_crypto_v2(
  p_user_id UUID,
  p_asset TEXT,
  p_amount DECIMAL(20, 8),
  p_rate DECIMAL(20, 2),
  p_fee_percentage DECIMAL(5, 4) DEFAULT 0.01,
  p_max_sell_per_transaction DECIMAL(20, 8) DEFAULT NULL,
  p_min_system_reserve DECIMAL(20, 2) DEFAULT 1000000.00
)
RETURNS TABLE(
  success BOOLEAN,
  ngn_amount DECIMAL(20, 2),
  new_balances JSONB,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_wallet RECORD;
  v_system_wallet RECORD;
  v_ngn_amount DECIMAL(20, 2);
  v_total_ngn_before_fee DECIMAL(20, 2);
  v_fee DECIMAL(20, 2);
  v_user_asset_balance DECIMAL(20, 8);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
  -- For wallet_balances and wallets tables
  v_current_ngn_from_wallet_balances DECIMAL(20, 2);
  v_current_ngn_from_wallets DECIMAL(20, 2);
  v_current_asset_from_wallet_balances DECIMAL(20, 8);
  v_user_ngn_balance DECIMAL(20, 2);
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Check max sell per transaction
  IF p_max_sell_per_transaction IS NOT NULL AND p_amount > p_max_sell_per_transaction THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Amount exceeds maximum sell per transaction: %s', p_max_sell_per_transaction)::TEXT;
    RETURN;
  END IF;

  -- Load user wallet from user_wallets
  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Create user wallet if it doesn't exist
    INSERT INTO public.user_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_user_wallet;
  END IF;

  -- Load system wallet
  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get user asset balance from user_wallets
  CASE p_asset
    WHEN 'BTC' THEN v_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  -- Also check wallet_balances table and use maximum balance
  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  -- Use maximum balance from both tables
  v_user_asset_balance := GREATEST(v_user_asset_balance, v_current_asset_from_wallet_balances);

  -- Validate user has enough balance
  IF v_user_asset_balance < p_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient balance. Current: %s %s, Requested: %s %s',
        v_user_asset_balance, p_asset, p_amount, p_asset)::TEXT;
    RETURN;
  END IF;

  -- Calculate amounts
  v_total_ngn_before_fee := p_amount * p_rate;
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  v_ngn_amount := v_total_ngn_before_fee - v_fee;

  -- Check system liquidity (NGN float balance)
  IF v_system_wallet.ngn_float_balance < v_ngn_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System liquidity low. Available: ₦%s, Required: ₦%s',
        v_system_wallet.ngn_float_balance, v_ngn_amount)::TEXT;
    RETURN;
  END IF;

  -- Check minimum system reserve (kill switch)
  v_new_system_ngn_balance := v_system_wallet.ngn_float_balance - v_ngn_amount;
  IF v_new_system_ngn_balance < p_min_system_reserve THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System reserve below minimum. Cannot process sell. Reserve would be: ₦%s, Minimum: ₦%s',
        v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balances
  v_new_user_asset_balance := v_user_asset_balance - p_amount;
  
  -- FIXED: Get current NGN balance from user_wallets (PRIMARY SOURCE OF TRUTH)
  -- Only use wallet_balances or wallets as fallback if user_wallets balance is NULL or 0
  v_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);
  
  -- Only check wallet_balances if user_wallets balance is NULL or 0
  IF v_user_ngn_balance IS NULL OR v_user_ngn_balance = 0 THEN
    SELECT COALESCE(balance, 0) INTO v_current_ngn_from_wallet_balances
    FROM public.wallet_balances 
    WHERE user_id = p_user_id AND currency = 'NGN'
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1;
    
    IF v_current_ngn_from_wallet_balances IS NOT NULL AND v_current_ngn_from_wallet_balances > 0 THEN
      v_user_ngn_balance := v_current_ngn_from_wallet_balances;
    ELSE
      -- Check wallets table as last resort
      SELECT COALESCE(ngn_balance, 0) INTO v_current_ngn_from_wallets
      FROM public.wallets 
      WHERE user_id = p_user_id;
      
      IF v_current_ngn_from_wallets IS NOT NULL AND v_current_ngn_from_wallets > 0 THEN
        v_user_ngn_balance := v_current_ngn_from_wallets;
      END IF;
    END IF;
  END IF;
  
  -- Calculate new NGN balance by adding the amount to the current balance
  v_new_user_ngn_balance := v_user_ngn_balance + v_ngn_amount;

  -- Get new system asset inventory
  CASE p_asset
    WHEN 'BTC' THEN 
      v_new_system_asset_inventory := v_system_wallet.btc_inventory + p_amount;
    WHEN 'ETH' THEN 
      v_new_system_asset_inventory := v_system_wallet.eth_inventory + p_amount;
    WHEN 'USDT' THEN 
      v_new_system_asset_inventory := v_system_wallet.usdt_inventory + p_amount;
    WHEN 'USDC' THEN 
      v_new_system_asset_inventory := v_system_wallet.usdc_inventory + p_amount;
    WHEN 'XRP' THEN 
      v_new_system_asset_inventory := v_system_wallet.xrp_inventory + p_amount;
    WHEN 'SOL' THEN 
      v_new_system_asset_inventory := v_system_wallet.sol_inventory + p_amount;
  END CASE;

  -- Generate reference
  v_reference := 'SELL_' || UPPER(p_asset) || '_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '_' || SUBSTRING(p_user_id::TEXT, 1, 8);

  -- Execute atomic transaction
  BEGIN
    -- 1. Update user_wallets table
    UPDATE public.user_wallets
    SET
      ngn_balance = v_new_user_ngn_balance,
      btc_balance = CASE WHEN p_asset = 'BTC' THEN v_new_user_asset_balance ELSE btc_balance END,
      eth_balance = CASE WHEN p_asset = 'ETH' THEN v_new_user_asset_balance ELSE eth_balance END,
      usdt_balance = CASE WHEN p_asset = 'USDT' THEN v_new_user_asset_balance ELSE usdt_balance END,
      usdc_balance = CASE WHEN p_asset = 'USDC' THEN v_new_user_asset_balance ELSE usdc_balance END,
      xrp_balance = CASE WHEN p_asset = 'XRP' THEN v_new_user_asset_balance ELSE xrp_balance END,
      sol_balance = CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE sol_balance END,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user_wallets';
    END IF;

    -- 2. Update wallet_balances table (for app compatibility)
    -- Update crypto balance
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_asset_balance, updated_at = NOW();

    -- Update NGN balance
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 3. Update wallets table (app reads from here first)
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (p_user_id, v_new_user_ngn_balance, COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 4. Update system wallet
    UPDATE public.system_wallets
    SET
      ngn_float_balance = v_new_system_ngn_balance,
      btc_inventory = CASE WHEN p_asset = 'BTC' THEN v_new_system_asset_inventory ELSE btc_inventory END,
      eth_inventory = CASE WHEN p_asset = 'ETH' THEN v_new_system_asset_inventory ELSE eth_inventory END,
      usdt_inventory = CASE WHEN p_asset = 'USDT' THEN v_new_system_asset_inventory ELSE usdt_inventory END,
      usdc_inventory = CASE WHEN p_asset = 'USDC' THEN v_new_system_asset_inventory ELSE usdc_inventory END,
      xrp_inventory = CASE WHEN p_asset = 'XRP' THEN v_new_system_asset_inventory ELSE xrp_inventory END,
      sol_inventory = CASE WHEN p_asset = 'SOL' THEN v_new_system_asset_inventory ELSE sol_inventory END,
      updated_at = NOW()
    WHERE id = 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update system wallet';
    END IF;

    -- 5. Insert transaction record
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      crypto_currency,
      crypto_amount,
      fiat_currency,
      fiat_amount,
      status,
      external_reference,
      completed_at,
      metadata
    )
    VALUES (
      p_user_id,
      'SELL',
      p_asset,
      p_amount,
      'NGN',
      v_ngn_amount,
      'COMPLETED',
      v_reference,
      NOW(),
      jsonb_build_object(
        'type', 'sell',
        'asset', p_asset,
        'crypto_amount', p_amount,
        'ngn_amount', v_ngn_amount,
        'rate', p_rate,
        'fee', v_fee,
        'fee_percentage', p_fee_percentage,
        'reference', v_reference,
        'instant_sell', true
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Return success with new balances
    RETURN QUERY SELECT 
      true,
      v_ngn_amount,
      jsonb_build_object(
        'ngn_balance', v_new_user_ngn_balance,
        'btc_balance', CASE WHEN p_asset = 'BTC' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.btc_balance, 0) END,
        'eth_balance', CASE WHEN p_asset = 'ETH' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.eth_balance, 0) END,
        'usdt_balance', CASE WHEN p_asset = 'USDT' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.usdt_balance, 0) END,
        'usdc_balance', CASE WHEN p_asset = 'USDC' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.usdc_balance, 0) END,
        'xrp_balance', CASE WHEN p_asset = 'XRP' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.xrp_balance, 0) END,
        'sol_balance', CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.sol_balance, 0) END
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    RETURN QUERY SELECT 
      false,
      0::DECIMAL,
      NULL::JSONB,
      SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.instant_sell_crypto_v2(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.instant_sell_crypto_v2 IS 'Atomically swaps crypto to NGN instantly. Updates user_wallets, wallet_balances, and wallets tables, plus system_wallets and transactions. All in one transaction. FIXED: NGN balance calculation now uses user_wallets.ngn_balance as primary source of truth, only checking other tables if NULL or 0.';
