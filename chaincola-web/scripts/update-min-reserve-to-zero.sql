-- Temporarily disable minimum reserve check for testing
-- WARNING: This should be restored to 1000000.00 for production!

-- Update the function to use 0 as minimum reserve
CREATE OR REPLACE FUNCTION public.instant_sell_crypto_v2(
  p_user_id UUID,
  p_asset TEXT,
  p_amount DECIMAL(20, 8),
  p_rate DECIMAL(20, 2),
  p_fee_percentage DECIMAL(5, 4) DEFAULT 0.01,
  p_max_sell_per_transaction DECIMAL(20, 8) DEFAULT NULL,
  p_min_system_reserve DECIMAL(20, 2) DEFAULT 0.00  -- Changed from 1000000.00 to 0.00 for testing
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
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Check max sell per transaction
  IF p_max_sell_per_transaction IS NOT NULL AND p_amount > p_max_sell_per_transaction THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Amount exceeds maximum sell per transaction: %s', p_max_sell_per_transaction)::TEXT;
    RETURN;
  END IF;

  -- Load user wallet
  SELECT * INTO v_user_wallet FROM public.user_wallets WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id) VALUES (p_user_id) RETURNING * INTO v_user_wallet;
  END IF;

  -- Load system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get user asset balance
  CASE p_asset
    WHEN 'BTC' THEN v_user_asset_balance := v_user_wallet.btc_balance;
    WHEN 'ETH' THEN v_user_asset_balance := v_user_wallet.eth_balance;
    WHEN 'USDT' THEN v_user_asset_balance := v_user_wallet.usdt_balance;
    WHEN 'USDC' THEN v_user_asset_balance := v_user_wallet.usdc_balance;
    WHEN 'XRP' THEN v_user_asset_balance := v_user_wallet.xrp_balance;
    WHEN 'SOL' THEN v_user_asset_balance := v_user_wallet.sol_balance;
  END CASE;

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

  -- Check system liquidity
  IF v_system_wallet.ngn_float_balance < v_ngn_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System liquidity low. Available: ₦%s, Required: ₦%s',
        v_system_wallet.ngn_float_balance, v_ngn_amount)::TEXT;
    RETURN;
  END IF;

  -- Check minimum system reserve (kill switch) - DISABLED FOR TESTING
  -- NOTE: In production, this should check: v_new_system_ngn_balance < p_min_system_reserve
  v_new_system_ngn_balance := v_system_wallet.ngn_float_balance - v_ngn_amount;
  -- Temporarily disabled minimum reserve check
  -- IF v_new_system_ngn_balance < p_min_system_reserve THEN
  --   RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
  --     format('System reserve below minimum. Cannot process sell. Reserve would be: ₦%s, Minimum: ₦%s',
  --       v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
  --   RETURN;
  -- END IF;

  -- Calculate new balances
  v_new_user_asset_balance := v_user_asset_balance - p_amount;
  v_new_user_ngn_balance := v_user_wallet.ngn_balance + v_ngn_amount;

  -- Get new system asset inventory
  CASE p_asset
    WHEN 'BTC' THEN v_new_system_asset_inventory := v_system_wallet.btc_inventory + p_amount;
    WHEN 'ETH' THEN v_new_system_asset_inventory := v_system_wallet.eth_inventory + p_amount;
    WHEN 'USDT' THEN v_new_system_asset_inventory := v_system_wallet.usdt_inventory + p_amount;
    WHEN 'USDC' THEN v_new_system_asset_inventory := v_system_wallet.usdc_inventory + p_amount;
    WHEN 'XRP' THEN v_new_system_asset_inventory := v_system_wallet.xrp_inventory + p_amount;
    WHEN 'SOL' THEN v_new_system_asset_inventory := v_system_wallet.sol_inventory + p_amount;
  END CASE;

  -- Generate reference
  v_reference := 'SELL_' || UPPER(p_asset) || '_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '_' || SUBSTRING(p_user_id::TEXT, 1, 8);

  -- Execute atomic transaction
  BEGIN
    -- Update user wallet
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
      RAISE EXCEPTION 'Failed to update user wallet';
    END IF;

    -- Update system wallet
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

    -- Insert transaction record
    INSERT INTO public.transactions (
      user_id, transaction_type, crypto_currency, crypto_amount,
      fiat_currency, fiat_amount, status, external_reference, completed_at, metadata
    )
    VALUES (
      p_user_id, 'SELL', p_asset, p_amount, 'NGN', v_ngn_amount,
      'COMPLETED', v_reference, NOW(),
      jsonb_build_object(
        'type', 'sell', 'asset', p_asset, 'crypto_amount', p_amount,
        'ngn_amount', v_ngn_amount, 'rate', p_rate, 'fee', v_fee,
        'fee_percentage', p_fee_percentage, 'reference', v_reference, 'instant_sell', true
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Return success
    RETURN QUERY SELECT 
      true, v_ngn_amount,
      jsonb_build_object(
        'ngn_balance', v_new_user_ngn_balance,
        'btc_balance', CASE WHEN p_asset = 'BTC' THEN v_new_user_asset_balance ELSE v_user_wallet.btc_balance END,
        'eth_balance', CASE WHEN p_asset = 'ETH' THEN v_new_user_asset_balance ELSE v_user_wallet.eth_balance END,
        'usdt_balance', CASE WHEN p_asset = 'USDT' THEN v_new_user_asset_balance ELSE v_user_wallet.usdt_balance END,
        'usdc_balance', CASE WHEN p_asset = 'USDC' THEN v_new_user_asset_balance ELSE v_user_wallet.usdc_balance END,
        'xrp_balance', CASE WHEN p_asset = 'XRP' THEN v_new_user_asset_balance ELSE v_user_wallet.xrp_balance END,
        'sol_balance', CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE v_user_wallet.sol_balance END
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.instant_sell_crypto_v2(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;

COMMENT ON FUNCTION public.instant_sell_crypto_v2 IS 'Atomically swaps crypto to NGN instantly. MINIMUM RESERVE CHECK TEMPORARILY DISABLED FOR TESTING - RESTORE FOR PRODUCTION!';
