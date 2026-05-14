-- instant_sell_crypto_v2: include transaction_id in success new_balances JSONB (for on-chain follow-up / metadata merge).

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
  v_uw_asset DECIMAL(20, 8);
  v_wb_bal DECIMAL(20, 8);
  v_wb_locked_before DECIMAL(20, 8);
  v_gross DECIMAL(20, 8);
  v_available DECIMAL(20, 8);
  v_reserve_rows INTEGER;
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
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

  CASE p_asset
    WHEN 'BTC' THEN v_uw_asset := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_uw_asset := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_uw_asset := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_uw_asset := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_uw_asset := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_uw_asset := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  INSERT INTO public.wallet_balances (user_id, currency, balance, locked, locked_balance, updated_at)
  VALUES (p_user_id, p_asset, v_uw_asset, 0, 0, NOW())
  ON CONFLICT (user_id, currency) DO NOTHING;

  SELECT
    COALESCE(wb.balance, 0),
    COALESCE(wb.locked, 0)
  INTO v_wb_bal, v_wb_locked_before
  FROM public.wallet_balances wb
  WHERE wb.user_id = p_user_id AND wb.currency = p_asset
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Could not lock %s balance row for sell', p_asset)::TEXT;
    RETURN;
  END IF;

  v_gross := GREATEST(v_uw_asset, v_wb_bal);
  v_available := v_gross - v_wb_locked_before;

  IF v_available < v_crypto_amount_sold THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format(
        'Insufficient available balance (after locks). Gross: %s %s, locked elsewhere: %s, requested: %s',
        v_gross, p_asset, v_wb_locked_before, v_crypto_amount_sold
      )::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  v_user_asset_balance := v_gross;

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
    -- Reserve sell amount on wallet_balances (same subtransaction as settle; rolls back if later step fails).
    UPDATE public.wallet_balances wb
    SET
      balance = v_gross,
      locked = COALESCE(wb.locked, 0) + v_crypto_amount_sold,
      locked_balance = COALESCE(wb.locked_balance, 0) + v_crypto_amount_sold,
      updated_at = NOW()
    WHERE wb.user_id = p_user_id
      AND wb.currency = p_asset
      AND (v_gross - COALESCE(wb.locked, 0)) >= v_crypto_amount_sold;

    GET DIAGNOSTICS v_reserve_rows = ROW_COUNT;
    IF v_reserve_rows IS NULL OR v_reserve_rows <> 1 THEN
      RAISE EXCEPTION 'INSTANT_SELL_RESERVE_FAILED';
    END IF;

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
    SET
      balance = v_new_user_asset_balance,
      locked = GREATEST(0::numeric, COALESCE(locked, 0) - v_crypto_amount_sold),
      locked_balance = GREATEST(0::numeric, COALESCE(locked_balance, 0) - v_crypto_amount_sold),
      updated_at = NOW()
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
        'wallet_balances_locked_reserve', v_crypto_amount_sold,
        'fix_version', 'v9_20260518_return_transaction_id'
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
        'system_ngn_balance', v_new_system_ngn_balance,
        'transaction_id', v_transaction_id
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    IF POSITION('INSTANT_SELL_RESERVE_FAILED' IN SQLERRM) > 0 THEN
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
        'Could not reserve crypto for sell (availability changed). Try again.'::TEXT;
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Sell failed: %s', SQLERRM)::TEXT;
    END IF;
  END;
END;
$$;

COMMENT ON FUNCTION public.instant_sell_crypto_v2(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL) IS
  'Instant sell: lock + reserve; NGN + treasury; success new_balances includes transaction_id for custody follow-up.';
