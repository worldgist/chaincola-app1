-- Record BUY_FEE / SELL_FEE into admin_revenue whenever instant buy/sell charges a fee.
-- Uses existing public.record_admin_revenue RPC (service_role / security definer).

-- Instant buy: apply rate, then fee (current production behavior).
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
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_current_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
  v_current_asset_from_wallet_balances DECIMAL(20, 8);
  v_verify_ngn_balance DECIMAL(20, 2);
BEGIN
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;

  IF p_ngn_amount IS NULL OR p_ngn_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'NGN amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Rate must be greater than 0'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_user_wallet;
  END IF;

  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);

  CASE p_asset
    WHEN 'BTC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  v_current_user_asset_balance := GREATEST(v_current_user_asset_balance, v_current_asset_from_wallet_balances);

  v_total_ngn_before_fee := p_ngn_amount;
  v_fee := ROUND(v_total_ngn_before_fee * p_fee_percentage, 2);
  v_ngn_to_debit := p_ngn_amount;
  v_crypto_amount := (v_total_ngn_before_fee - v_fee) / p_rate;
  v_crypto_amount := ROUND(v_crypto_amount, 8);

  IF v_current_user_ngn_balance < v_ngn_to_debit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient NGN balance. Current: ₦%s, Required: ₦%s', v_current_user_ngn_balance, v_ngn_to_debit)::TEXT;
    RETURN;
  END IF;

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

  v_new_system_ngn_balance := v_system_wallet.ngn_float_balance + v_ngn_to_debit;
  IF v_new_system_ngn_balance < p_min_system_reserve THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System reserve would fall below minimum. Current: ₦%s, After: ₦%s, Minimum: ₦%s',
        v_system_wallet.ngn_float_balance, v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
    RETURN;
  END IF;

  v_new_user_asset_balance := v_current_user_asset_balance + v_crypto_amount;
  v_new_user_ngn_balance := ROUND(v_current_user_ngn_balance - v_ngn_to_debit, 2);

  IF v_new_user_ngn_balance >= v_current_user_ngn_balance THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('CRITICAL ERROR: NGN balance would increase during Buy. Current: ₦%s, New: ₦%s. Aborting.',
        v_current_user_ngn_balance, v_new_user_ngn_balance)::TEXT;
    RETURN;
  END IF;
  IF v_crypto_amount IS NULL OR v_crypto_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'CRITICAL ERROR: Invalid crypto_amount.'::TEXT;
    RETURN;
  END IF;

  v_reference := format('BUY_%s_%s_%s_%s',
    p_asset, p_user_id, EXTRACT(EPOCH FROM NOW())::BIGINT,
    LPAD(EXTRACT(MICROSECONDS FROM NOW())::BIGINT::TEXT, 6, '0'));

  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = p_user_id AND external_reference = v_reference AND transaction_type = 'BUY' AND crypto_currency = p_asset
  ) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Duplicate transaction: %s', v_reference)::TEXT;
    RETURN;
  END IF;

  BEGIN
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

  IF NOT FOUND THEN RAISE EXCEPTION 'Failed to update user_wallets'; END IF;

  SELECT ngn_balance INTO v_verify_ngn_balance FROM public.user_wallets WHERE user_id = p_user_id;
  IF v_verify_ngn_balance IS NULL OR v_verify_ngn_balance > v_current_user_ngn_balance THEN
    RAISE EXCEPTION 'CRITICAL: NGN was not debited. Expected decreased balance.';
  END IF;
  IF ABS(v_verify_ngn_balance - v_new_user_ngn_balance) > 0.01 THEN
    RAISE EXCEPTION 'CRITICAL: NGN balance mismatch.';
  END IF;

  INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
  VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW())
  ON CONFLICT (user_id, currency) DO UPDATE SET balance = v_new_user_asset_balance, updated_at = NOW();

  INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
  VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
  ON CONFLICT (user_id, currency) DO UPDATE SET balance = v_new_user_ngn_balance, updated_at = NOW();

  INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
  VALUES (p_user_id, v_new_user_ngn_balance, COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0), NOW())
  ON CONFLICT (user_id) DO UPDATE SET ngn_balance = v_new_user_ngn_balance, updated_at = NOW();

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

  IF NOT FOUND THEN RAISE EXCEPTION 'Failed to update system wallet'; END IF;

  INSERT INTO public.transactions (
    user_id, transaction_type, crypto_currency, crypto_amount, fiat_amount, fiat_currency,
    fee_amount, fee_percentage, fee_currency, status, external_reference, completed_at, metadata
  )
  VALUES (
    p_user_id, 'BUY', p_asset, v_crypto_amount, v_ngn_to_debit, 'NGN',
    v_fee, p_fee_percentage * 100, 'NGN', 'COMPLETED', v_reference, NOW(),
    jsonb_build_object(
      'rate', p_rate,
      'fee_percentage', p_fee_percentage,
      'fee_amount', v_fee,
      'instant_buy', true,
      'reference', v_reference,
      'ngn_amount_paid', v_ngn_to_debit,
      'crypto_amount_received', v_crypto_amount,
      'rate_then_fee', true
    )
  )
  RETURNING id INTO v_transaction_id;

  -- Record buy fee as admin revenue (NGN)
  IF v_fee IS NOT NULL AND v_fee > 0 THEN
    PERFORM public.record_admin_revenue(
      p_revenue_type := 'BUY_FEE',
      p_source := 'INSTANT_BUY',
      p_amount := v_fee,
      p_currency := 'NGN',
      p_fee_percentage := p_fee_percentage * 100,
      p_base_amount := v_total_ngn_before_fee,
      p_transaction_id := v_transaction_id,
      p_user_id := p_user_id,
      p_metadata := jsonb_build_object('asset', p_asset, 'rate', p_rate),
      p_notes := 'Instant buy fee'
    );
  END IF;

  IF v_new_user_ngn_balance > v_current_user_ngn_balance THEN
    RAISE EXCEPTION 'CRITICAL FAILURE: NGN balance increased during Buy. Before: %, After: %, Debit: %',
      v_current_user_ngn_balance, v_new_user_ngn_balance, v_ngn_to_debit;
  END IF;

  RETURN QUERY SELECT
    true,
    v_crypto_amount,
    jsonb_build_object(
      'ngn_balance', v_new_user_ngn_balance,
      'crypto_balance', v_new_user_asset_balance,
      'crypto_symbol', p_asset,
      'transaction_id', v_transaction_id,
      'ngn_balance_before', v_current_user_ngn_balance,
      'ngn_amount_debited', v_ngn_to_debit,
      'crypto_amount_credited', v_crypto_amount
    ),
    NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, SQLERRM::TEXT;
  END;
END;
$$;

-- Instant sell: exact formula and validations (current production behavior).
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
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
  v_current_asset_from_wallet_balances DECIMAL(20, 8);
  v_crypto_amount_sold DECIMAL(20, 8);
  v_expected_ngn_max DECIMAL(20, 2);
BEGIN
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Sell price (rate) must be greater than 0'::TEXT;
    RETURN;
  END IF;

  v_crypto_amount_sold := p_amount;

  IF p_max_sell_per_transaction IS NOT NULL AND v_crypto_amount_sold > p_max_sell_per_transaction THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Amount exceeds maximum sell per transaction: %s', p_max_sell_per_transaction)::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_user_wallet;
  END IF;

  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  CASE p_asset
    WHEN 'BTC' THEN v_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  v_user_asset_balance := GREATEST(v_user_asset_balance, v_current_asset_from_wallet_balances);

  IF v_user_asset_balance < v_crypto_amount_sold THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient balance. Current: %s %s, Requested: %s %s',
        v_user_asset_balance, p_asset, v_crypto_amount_sold, p_asset)::TEXT;
    RETURN;
  END IF;

  v_total_ngn_before_fee := v_crypto_amount_sold * p_rate;
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  v_ngn_amount := v_total_ngn_before_fee - v_fee;

  v_ngn_amount := ROUND(v_ngn_amount, 2);
  v_fee := ROUND(v_fee, 2);
  v_total_ngn_before_fee := ROUND(v_total_ngn_before_fee, 2);

  v_expected_ngn_max := v_crypto_amount_sold * p_rate * 1.1;
  IF v_ngn_amount > v_expected_ngn_max THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('CRITICAL ERROR: Calculated NGN amount (%s) exceeds maximum expected (%s). crypto_amount=%s, rate=%s',
        v_ngn_amount, v_expected_ngn_max, v_crypto_amount_sold, p_rate)::TEXT;
    RETURN;
  END IF;

  IF v_system_wallet.ngn_float_balance < v_ngn_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System liquidity low. Available: ₦%s, Required: ₦%s',
        v_system_wallet.ngn_float_balance, v_ngn_amount)::TEXT;
    RETURN;
  END IF;

  v_new_system_ngn_balance := v_system_wallet.ngn_float_balance - v_ngn_amount;
  IF v_new_system_ngn_balance < p_min_system_reserve THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System reserve below minimum. Cannot process sell. Reserve would be: ₦%s, Minimum: ₦%s',
        v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
    RETURN;
  END IF;

  v_new_user_asset_balance := v_user_asset_balance - v_crypto_amount_sold;
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);
  v_new_user_ngn_balance := ROUND(v_current_user_ngn_balance + v_ngn_amount, 2);

  CASE p_asset
    WHEN 'BTC' THEN v_new_system_asset_inventory := v_system_wallet.btc_inventory + v_crypto_amount_sold;
    WHEN 'ETH' THEN v_new_system_asset_inventory := v_system_wallet.eth_inventory + v_crypto_amount_sold;
    WHEN 'USDT' THEN v_new_system_asset_inventory := v_system_wallet.usdt_inventory + v_crypto_amount_sold;
    WHEN 'USDC' THEN v_new_system_asset_inventory := v_system_wallet.usdc_inventory + v_crypto_amount_sold;
    WHEN 'XRP' THEN v_new_system_asset_inventory := v_system_wallet.xrp_inventory + v_crypto_amount_sold;
    WHEN 'SOL' THEN v_new_system_asset_inventory := v_system_wallet.sol_inventory + v_crypto_amount_sold;
  END CASE;

  v_transaction_id := gen_random_uuid();
  v_reference := format('SELL_%s_%s_%s', p_asset, TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'), SUBSTRING(v_transaction_id::TEXT, 1, 8));

  BEGIN
    UPDATE public.user_wallets
    SET
      btc_balance = CASE WHEN p_asset = 'BTC' THEN v_new_user_asset_balance ELSE btc_balance END,
      eth_balance = CASE WHEN p_asset = 'ETH' THEN v_new_user_asset_balance ELSE eth_balance END,
      usdt_balance = CASE WHEN p_asset = 'USDT' THEN v_new_user_asset_balance ELSE usdt_balance END,
      usdc_balance = CASE WHEN p_asset = 'USDC' THEN v_new_user_asset_balance ELSE usdc_balance END,
      xrp_balance = CASE WHEN p_asset = 'XRP' THEN v_new_user_asset_balance ELSE xrp_balance END,
      sol_balance = CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE sol_balance END,
      ngn_balance = v_new_user_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user_wallets';
    END IF;

    UPDATE public.wallet_balances
    SET balance = v_new_user_asset_balance, updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_asset;

    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency)
    DO UPDATE SET balance = v_new_user_ngn_balance, updated_at = NOW();

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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update system_wallets';
    END IF;

    INSERT INTO public.transactions (
      id, user_id, transaction_type, crypto_currency, crypto_amount,
      fiat_amount, fiat_currency, fee_amount, fee_percentage, fee_currency,
      status, external_reference, notes, completed_at, metadata
    )
    VALUES (
      v_transaction_id, p_user_id, 'SELL', p_asset, v_crypto_amount_sold,
      v_ngn_amount, 'NGN', v_fee, p_fee_percentage * 100, 'NGN',
      'COMPLETED', v_reference,
      format('Sold %s %s for ₦%s', v_crypto_amount_sold, p_asset, v_ngn_amount),
      NOW(),
      jsonb_build_object(
        'crypto_amount_sold', v_crypto_amount_sold,
        'sell_price', p_rate,
        'total_ngn_before_fee', v_total_ngn_before_fee,
        'fee_amount', v_fee,
        'fee_percentage', p_fee_percentage,
        'ngn_amount_credited', v_ngn_amount,
        'instant_sell', true,
        'fix_version', 'v6_20260208_ngn_calculation_bug_fix'
      )
    );

    -- Record sell fee as admin revenue (NGN)
    IF v_fee IS NOT NULL AND v_fee > 0 THEN
      PERFORM public.record_admin_revenue(
        p_revenue_type := 'SELL_FEE',
        p_source := 'INSTANT_SELL',
        p_amount := v_fee,
        p_currency := 'NGN',
        p_fee_percentage := p_fee_percentage * 100,
        p_base_amount := v_total_ngn_before_fee,
        p_transaction_id := v_transaction_id,
        p_user_id := p_user_id,
        p_metadata := jsonb_build_object('asset', p_asset, 'rate', p_rate),
        p_notes := 'Instant sell fee'
      );
    END IF;

    RETURN QUERY SELECT
      true,
      v_ngn_amount,
      jsonb_build_object(
        'crypto_balance', v_new_user_asset_balance,
        'ngn_balance', v_new_user_ngn_balance,
        'system_crypto_inventory', v_new_system_asset_inventory,
        'system_ngn_balance', v_new_system_ngn_balance
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Sell failed: %s', SQLERRM)::TEXT;
  END;
END;
$$;

