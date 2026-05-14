-- Align on-chain deposit / send with system_wallets:
--   * Deposits credit user balances AND increase *_pending_inventory (custody bucket tied to detected deposits).
--   * Sends debit user balances AND reduce *_pending_inventory only up to the send size (instant-buy balances are not in this bucket).
--   * instant_sell_crypto_v2 internalizes pending into *_inventory for the sold amount so deposit + sell does not double-count hot inventory.

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
  v_sym TEXT := upper(trim(p_currency));
BEGIN
  IF p_currency IS NULL OR trim(p_currency) = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  PERFORM 1 FROM public.system_wallets WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.system_wallets (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
    PERFORM 1 FROM public.system_wallets WHERE id = 1 FOR UPDATE;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = v_sym;

  IF v_current_balance IS NULL THEN
    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_current_balance + p_amount;
  END IF;

  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, v_sym, v_new_balance)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();

  INSERT INTO public.user_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_wallets
  SET
    btc_balance = CASE WHEN v_sym = 'BTC' THEN COALESCE(btc_balance, 0) + p_amount ELSE btc_balance END,
    eth_balance = CASE WHEN v_sym = 'ETH' THEN COALESCE(eth_balance, 0) + p_amount ELSE eth_balance END,
    usdt_balance = CASE WHEN v_sym = 'USDT' THEN COALESCE(usdt_balance, 0) + p_amount ELSE usdt_balance END,
    usdc_balance = CASE WHEN v_sym = 'USDC' THEN COALESCE(usdc_balance, 0) + p_amount ELSE usdc_balance END,
    xrp_balance = CASE WHEN v_sym = 'XRP' THEN COALESCE(xrp_balance, 0) + p_amount ELSE xrp_balance END,
    sol_balance = CASE WHEN v_sym = 'SOL' THEN COALESCE(sol_balance, 0) + p_amount ELSE sol_balance END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  IF v_sym IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    UPDATE public.system_wallets
    SET
      btc_pending_inventory = CASE WHEN v_sym = 'BTC' THEN COALESCE(btc_pending_inventory, 0) + p_amount ELSE btc_pending_inventory END,
      eth_pending_inventory = CASE WHEN v_sym = 'ETH' THEN COALESCE(eth_pending_inventory, 0) + p_amount ELSE eth_pending_inventory END,
      usdt_pending_inventory = CASE WHEN v_sym = 'USDT' THEN COALESCE(usdt_pending_inventory, 0) + p_amount ELSE usdt_pending_inventory END,
      usdc_pending_inventory = CASE WHEN v_sym = 'USDC' THEN COALESCE(usdc_pending_inventory, 0) + p_amount ELSE usdc_pending_inventory END,
      xrp_pending_inventory = CASE WHEN v_sym = 'XRP' THEN COALESCE(xrp_pending_inventory, 0) + p_amount ELSE xrp_pending_inventory END,
      sol_pending_inventory = CASE WHEN v_sym = 'SOL' THEN COALESCE(sol_pending_inventory, 0) + p_amount ELSE sol_pending_inventory END,
      updated_at = NOW()
    WHERE id = 1;
  END IF;

  RAISE NOTICE 'Credited % % to user %. New balance: %', p_amount, p_currency, p_user_id, v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.credit_crypto_wallet(UUID, DECIMAL, TEXT) IS
  'Credits user crypto (wallet_balances + user_wallets). For listed assets, also credits system_wallets *_pending_inventory (on-chain deposit custody).';

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
  v_sym TEXT := upper(trim(p_currency));
  v_uw DECIMAL(20, 8) := 0;
  v_wb DECIMAL(20, 8) := 0;
  v_current DECIMAL(20, 8);
  v_new DECIMAL(20, 8);
  v_take DECIMAL(20, 8);
  v_pend DECIMAL(20, 8);
BEGIN
  IF p_currency IS NULL OR trim(p_currency) = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  PERFORM 1 FROM public.system_wallets WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.system_wallets (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
    PERFORM 1 FROM public.system_wallets WHERE id = 1 FOR UPDATE;
  END IF;

  PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_sym = 'BTC' THEN
    SELECT COALESCE(btc_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSIF v_sym = 'ETH' THEN
    SELECT COALESCE(eth_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSIF v_sym = 'USDT' THEN
    SELECT COALESCE(usdt_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSIF v_sym = 'USDC' THEN
    SELECT COALESCE(usdc_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSIF v_sym = 'XRP' THEN
    SELECT COALESCE(xrp_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSIF v_sym = 'SOL' THEN
    SELECT COALESCE(sol_balance, 0) INTO v_uw FROM public.user_wallets WHERE user_id = p_user_id;
  ELSE
    v_uw := 0;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_wb
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = v_sym;
  IF NOT FOUND THEN
    v_wb := 0;
  END IF;

  v_current := GREATEST(COALESCE(v_uw, 0), COALESCE(v_wb, 0));

  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current, p_amount;
  END IF;

  v_new := ROUND(v_current - p_amount, 8);

  BEGIN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, v_sym, v_new, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  UPDATE public.user_wallets
  SET
    btc_balance = CASE WHEN v_sym = 'BTC' THEN v_new ELSE btc_balance END,
    eth_balance = CASE WHEN v_sym = 'ETH' THEN v_new ELSE eth_balance END,
    usdt_balance = CASE WHEN v_sym = 'USDT' THEN v_new ELSE usdt_balance END,
    usdc_balance = CASE WHEN v_sym = 'USDC' THEN v_new ELSE usdc_balance END,
    xrp_balance = CASE WHEN v_sym = 'XRP' THEN v_new ELSE xrp_balance END,
    sol_balance = CASE WHEN v_sym = 'SOL' THEN v_new ELSE sol_balance END,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  IF v_sym = 'BTC' THEN
    SELECT COALESCE(btc_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      btc_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  ELSIF v_sym = 'ETH' THEN
    SELECT COALESCE(eth_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      eth_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  ELSIF v_sym = 'USDT' THEN
    SELECT COALESCE(usdt_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      usdt_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  ELSIF v_sym = 'USDC' THEN
    SELECT COALESCE(usdc_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      usdc_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  ELSIF v_sym = 'XRP' THEN
    SELECT COALESCE(xrp_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      xrp_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  ELSIF v_sym = 'SOL' THEN
    SELECT COALESCE(sol_pending_inventory, 0) INTO v_pend FROM public.system_wallets WHERE id = 1;
    v_take := LEAST(p_amount, v_pend);
    UPDATE public.system_wallets
    SET
      sol_pending_inventory = GREATEST(0::numeric, v_pend - v_take),
      updated_at = NOW()
    WHERE id = 1;
  END IF;

  RAISE NOTICE 'Debited % % from user %. New balance: %', p_amount, p_currency, p_user_id, v_new;
END;
$$;

COMMENT ON FUNCTION public.debit_crypto_wallet(UUID, DECIMAL, TEXT) IS
  'Debits user crypto (GREATEST of user_wallets vs wallet_balances), syncs user_wallets, and reduces system_wallets *_pending_inventory only (deposit bucket). Does not debit hot *_inventory (instant-buy user balances are off that pool).';

-- instant_sell: move sold amount from *_pending_inventory into *_inventory (remainder only),
-- so deposit pending + sell does not double-count hot inventory.
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
  v_pend_before DECIMAL(20, 8);
  v_from_pend DECIMAL(20, 8);
  v_new_pend DECIMAL(20, 8);
  v_inv_before DECIMAL(20, 8);
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
    WHEN 'BTC' THEN
      v_pend_before := COALESCE(v_system_wallet.btc_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.btc_inventory, 0);
    WHEN 'ETH' THEN
      v_pend_before := COALESCE(v_system_wallet.eth_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.eth_inventory, 0);
    WHEN 'USDT' THEN
      v_pend_before := COALESCE(v_system_wallet.usdt_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.usdt_inventory, 0);
    WHEN 'USDC' THEN
      v_pend_before := COALESCE(v_system_wallet.usdc_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.usdc_inventory, 0);
    WHEN 'XRP' THEN
      v_pend_before := COALESCE(v_system_wallet.xrp_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.xrp_inventory, 0);
    WHEN 'SOL' THEN
      v_pend_before := COALESCE(v_system_wallet.sol_pending_inventory, 0);
      v_inv_before := COALESCE(v_system_wallet.sol_inventory, 0);
  END CASE;

  v_from_pend := LEAST(v_crypto_amount_sold, v_pend_before);
  v_new_pend := v_pend_before - v_from_pend;
  v_new_system_asset_inventory := ROUND(v_inv_before + (v_crypto_amount_sold - v_from_pend), 8);

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
      btc_pending_inventory = CASE WHEN p_asset = 'BTC' THEN v_new_pend ELSE btc_pending_inventory END,
      eth_pending_inventory = CASE WHEN p_asset = 'ETH' THEN v_new_pend ELSE eth_pending_inventory END,
      usdt_pending_inventory = CASE WHEN p_asset = 'USDT' THEN v_new_pend ELSE usdt_pending_inventory END,
      usdc_pending_inventory = CASE WHEN p_asset = 'USDC' THEN v_new_pend ELSE usdc_pending_inventory END,
      xrp_pending_inventory = CASE WHEN p_asset = 'XRP' THEN v_new_pend ELSE xrp_pending_inventory END,
      sol_pending_inventory = CASE WHEN p_asset = 'SOL' THEN v_new_pend ELSE sol_pending_inventory END,
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
        'treasury_pending_consumed', v_from_pend,
        'fix_version', 'v7_20260516_pending_internalize'
      )
    );

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

GRANT EXECUTE ON FUNCTION public.credit_crypto_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.debit_crypto_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.instant_sell_crypto_v2(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;
