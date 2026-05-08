-- Create instant buy crypto function
-- Swaps NGN to crypto instantly using database transaction
-- Debits user NGN balance and credits crypto balance
-- Moves crypto from system inventory to user wallet
-- Credits system NGN float balance

CREATE OR REPLACE FUNCTION public.instant_buy_crypto(
  p_user_id UUID,
  p_asset TEXT,
  p_ngn_amount DECIMAL(20, 2),
  p_rate DECIMAL(20, 2),
  p_fee_percentage DECIMAL(5, 4) DEFAULT 0.01,
  p_min_system_reserve DECIMAL(20, 2) DEFAULT 1000000.00
)
RETURNS TABLE(
  success BOOLEAN,
  crypto_amount DECIMAL(20, 8),
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
  v_crypto_amount DECIMAL(20, 8);
  v_total_ngn_before_fee DECIMAL(20, 2);
  v_fee DECIMAL(20, 2);
  v_ngn_to_debit DECIMAL(20, 2);
  v_user_ngn_balance DECIMAL(20, 2);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_current_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
  -- For wallet_balances and wallets tables
  v_current_ngn_from_wallet_balances DECIMAL(20, 2);
  v_current_asset_from_wallet_balances DECIMAL(20, 8);
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_ngn_amount IS NULL OR p_ngn_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      'NGN amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Validate rate
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      'Rate must be greater than 0'::TEXT;
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

  -- Get user NGN balance from user_wallets
  v_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);

  -- Also check wallet_balances table
  SELECT COALESCE(MAX(balance), 0) INTO v_current_ngn_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = 'NGN';

  -- Use maximum balance from both tables
  IF v_current_ngn_from_wallet_balances > v_user_ngn_balance THEN
    v_user_ngn_balance := v_current_ngn_from_wallet_balances;
  END IF;

  -- Get user asset balance from user_wallets
  CASE p_asset
    WHEN 'BTC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  -- Also check wallet_balances table
  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  -- Use maximum balance from both tables
  IF v_current_asset_from_wallet_balances > v_current_user_asset_balance THEN
    v_current_user_asset_balance := v_current_asset_from_wallet_balances;
  END IF;

  -- Calculate amounts
  v_total_ngn_before_fee := p_ngn_amount;
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  v_ngn_to_debit := v_total_ngn_before_fee + v_fee; -- User pays amount + fee
  
  -- Calculate crypto amount (after fee is deducted from NGN)
  v_crypto_amount := (v_total_ngn_before_fee - v_fee) / p_rate;

  -- Check if user has sufficient NGN balance
  IF v_user_ngn_balance < v_ngn_to_debit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient NGN balance. Current: ₦%s, Required: ₦%s', 
        v_user_ngn_balance, v_ngn_to_debit)::TEXT;
    RETURN;
  END IF;

  -- Check system crypto inventory
  CASE p_asset
    WHEN 'BTC' THEN 
      IF v_system_wallet.btc_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.btc_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.btc_inventory - v_crypto_amount;
    WHEN 'ETH' THEN 
      IF v_system_wallet.eth_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.eth_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.eth_inventory - v_crypto_amount;
    WHEN 'USDT' THEN 
      IF v_system_wallet.usdt_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.usdt_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.usdt_inventory - v_crypto_amount;
    WHEN 'USDC' THEN 
      IF v_system_wallet.usdc_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.usdc_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.usdc_inventory - v_crypto_amount;
    WHEN 'XRP' THEN 
      IF v_system_wallet.xrp_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.xrp_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.xrp_inventory - v_crypto_amount;
    WHEN 'SOL' THEN 
      IF v_system_wallet.sol_inventory < v_crypto_amount THEN
        RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
          format('Insufficient system inventory. Available: %s %s, Requested: %s %s',
            v_system_wallet.sol_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
        RETURN;
      END IF;
      v_new_system_asset_inventory := v_system_wallet.sol_inventory - v_crypto_amount;
  END CASE;

  -- Check minimum system NGN reserve
  v_new_system_ngn_balance := v_system_wallet.ngn_float_balance + v_ngn_to_debit;
  IF v_new_system_ngn_balance < p_min_system_reserve THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System reserve would fall below minimum. Current: ₦%s, After: ₦%s, Minimum: ₦%s',
        v_system_wallet.ngn_float_balance, v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balances
  v_new_user_ngn_balance := v_user_ngn_balance - v_ngn_to_debit;
  v_new_user_asset_balance := v_current_user_asset_balance + v_crypto_amount;

  -- Generate reference
  v_reference := format('BUY_%s_%s_%s', p_asset, p_user_id, EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- Perform atomic transaction
  BEGIN
    -- Update user_wallets: debit NGN, credit crypto
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

    -- Update wallet_balances: debit NGN
    INSERT INTO public.wallet_balances (user_id, currency, balance, created_at, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW(), NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_ngn_balance, updated_at = NOW();

    -- Update wallet_balances: credit crypto
    INSERT INTO public.wallet_balances (user_id, currency, balance, created_at, updated_at)
    VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW(), NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_asset_balance, updated_at = NOW();

    -- Update system_wallets: debit crypto inventory, credit NGN float
    UPDATE public.system_wallets
    SET
      btc_inventory = CASE WHEN p_asset = 'BTC' THEN v_new_system_asset_inventory ELSE btc_inventory END,
      eth_inventory = CASE WHEN p_asset = 'ETH' THEN v_new_system_asset_inventory ELSE eth_inventory END,
      usdt_inventory = CASE WHEN p_asset = 'USDT' THEN v_new_system_asset_inventory ELSE usdt_inventory END,
      usdc_inventory = CASE WHEN p_asset = 'USDC' THEN v_new_system_asset_inventory ELSE usdc_inventory END,
      xrp_inventory = CASE WHEN p_asset = 'XRP' THEN v_new_system_asset_inventory ELSE xrp_inventory END,
      sol_inventory = CASE WHEN p_asset = 'SOL' THEN v_new_system_asset_inventory ELSE sol_inventory END,
      ngn_float_balance = v_new_system_ngn_balance,
      updated_at = NOW()
    WHERE id = 1;

    -- Create transaction record
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      crypto_currency,
      crypto_amount,
      fiat_amount,
      fiat_currency,
      fee_amount,
      fee_percentage,
      status,
      metadata
    )
    VALUES (
      p_user_id,
      'BUY',
      p_asset,
      v_crypto_amount,
      v_ngn_to_debit,
      'NGN',
      v_fee,
      p_fee_percentage * 100, -- Convert to percentage (e.g., 0.01 -> 1.00)
      'COMPLETED',
      jsonb_build_object(
        'rate', p_rate,
        'fee_percentage', p_fee_percentage,
        'fee_amount', v_fee,
        'instant_buy', true,
        'reference', v_reference
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Return success
    RETURN QUERY SELECT 
      true,
      v_crypto_amount,
      jsonb_build_object(
        'ngn_balance', v_new_user_ngn_balance,
        'crypto_balance', v_new_user_asset_balance,
        'crypto_symbol', p_asset,
        'transaction_id', v_transaction_id
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false,
      0::DECIMAL,
      NULL::JSONB,
      SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.instant_buy_crypto(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.instant_buy_crypto IS 'Instant buy crypto function. Swaps NGN to crypto instantly using system inventory. Updates user_wallets, wallet_balances, and system_wallets tables.';
