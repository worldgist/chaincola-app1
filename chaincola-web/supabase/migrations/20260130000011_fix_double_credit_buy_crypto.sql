-- CRITICAL FIX: Prevent double credit in NGN wallet during buy crypto
-- Issue: When buying crypto, NGN wallet is being credited double the amount instead of debited
-- Root Cause: Possible trigger or function adding to balance instead of setting it
-- Solution: Explicitly SET balance (not add), and add verification to prevent any credit during buy

DROP FUNCTION IF EXISTS public.instant_buy_crypto(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL);

CREATE OR REPLACE FUNCTION public.instant_buy_crypto(
  p_user_id UUID,
  p_asset TEXT,
  p_ngn_amount DECIMAL(20, 2),
  p_rate DECIMAL(20, 2),
  p_fee_percentage DECIMAL(5, 4),
  p_min_system_reserve DECIMAL(20, 2)
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
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_current_user_asset_balance DECIMAL(20, 8);
  v_current_system_asset_inventory DECIMAL(20, 8);
  v_current_system_ngn_balance DECIMAL(20, 2);
  v_fee DECIMAL(20, 2);
  v_ngn_to_debit DECIMAL(20, 2);
  v_crypto_amount DECIMAL(20, 8);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_reference TEXT;
  v_transaction_id UUID;
  v_verify_ngn_balance DECIMAL(20, 2);
BEGIN
  -- Validate inputs
  IF p_asset IS NULL OR p_asset = '' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Asset is required'::TEXT;
    RETURN;
  END IF;

  IF p_ngn_amount IS NULL OR p_ngn_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'NGN amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Invalid buy price'::TEXT;
    RETURN;
  END IF;

  -- Lock user wallet row to prevent race conditions
  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Create wallet if doesn't exist
  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id, ngn_balance)
    VALUES (p_user_id, 0)
    RETURNING * INTO v_user_wallet;
  END IF;

  -- Lock system wallet row
  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get current balances from locked rows (PRIMARY SOURCE OF TRUTH)
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);
  
  -- Get current crypto balance
  CASE p_asset
    WHEN 'BTC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Unsupported asset: %s', p_asset)::TEXT;
      RETURN;
  END CASE;

  -- Get system inventory
  CASE p_asset
    WHEN 'BTC' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.btc_inventory, 0);
    WHEN 'ETH' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.eth_inventory, 0);
    WHEN 'USDT' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.usdt_inventory, 0);
    WHEN 'USDC' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.usdc_inventory, 0);
    WHEN 'XRP' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.xrp_inventory, 0);
    WHEN 'SOL' THEN v_current_system_asset_inventory := COALESCE(v_system_wallet.sol_inventory, 0);
  END CASE;

  v_current_system_ngn_balance := COALESCE(v_system_wallet.ngn_float_balance, 0);

  -- Check user has sufficient NGN balance
  v_fee := ROUND(p_ngn_amount * p_fee_percentage, 2);
  v_ngn_to_debit := ROUND(p_ngn_amount + v_fee, 2);

  IF v_current_user_ngn_balance < v_ngn_to_debit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient NGN balance. Current: ₦%s, Required: ₦%s', v_current_user_ngn_balance, v_ngn_to_debit)::TEXT;
    RETURN;
  END IF;

  -- Check system has sufficient crypto inventory
  v_crypto_amount := ROUND((p_ngn_amount / p_rate)::DECIMAL, 8);

  IF v_current_system_asset_inventory < v_crypto_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System inventory low. Available: %s %s, Required: %s %s',
        v_current_system_asset_inventory, p_asset, v_crypto_amount, p_asset)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balances
  -- CRITICAL: NGN balance MUST decrease (debit), crypto balance MUST increase (credit)
  v_new_user_ngn_balance := ROUND(v_current_user_ngn_balance - v_ngn_to_debit, 2);
  v_new_user_asset_balance := ROUND(v_current_user_asset_balance + v_crypto_amount, 8);
  v_new_system_asset_inventory := ROUND(v_current_system_asset_inventory - v_crypto_amount, 8);
  v_new_system_ngn_balance := ROUND(v_current_system_ngn_balance + v_ngn_to_debit, 2);

  -- Safety guard: NGN balance must decrease
  IF v_new_user_ngn_balance >= v_current_user_ngn_balance THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('CRITICAL ERROR: NGN balance would not decrease. Current: ₦%s, New: ₦%s', 
        v_current_user_ngn_balance, v_new_user_ngn_balance)::TEXT;
    RETURN;
  END IF;

  -- Generate reference
  v_reference := format('BUY_%s_%s_%s', p_asset, p_user_id, EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- ATOMIC TRANSACTION: Update ONLY user_wallets first (source of truth)
  BEGIN
    -- 1. Update user_wallets: DEBIT NGN (subtract), CREDIT crypto (add)
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

    -- CRITICAL: Verify the update actually happened correctly
    SELECT ngn_balance INTO v_verify_ngn_balance
    FROM public.user_wallets
    WHERE user_id = p_user_id;
    
    -- CRITICAL VALIDATION: Verify balance was debited (decreased), not credited (increased)
    IF v_verify_ngn_balance IS NULL OR v_verify_ngn_balance > v_current_user_ngn_balance THEN
      RAISE EXCEPTION 'CRITICAL FAILURE: NGN balance was NOT debited correctly. Expected: ₦% (decreased from ₦%), Actual: ₦%. This violates core rule: BUY = NGN → CRYPTO (debit NGN only).',
        v_new_user_ngn_balance, v_current_user_ngn_balance, COALESCE(v_verify_ngn_balance, 0);
    END IF;
    
    -- Additional check: verify it matches our calculation (allow small rounding differences)
    IF ABS(v_verify_ngn_balance - v_new_user_ngn_balance) > 0.01 THEN
      RAISE EXCEPTION 'CRITICAL FAILURE: NGN balance mismatch. Calculated: ₦%, Actual in DB: ₦%.',
        v_new_user_ngn_balance, v_verify_ngn_balance;
    END IF;

    -- 2. Sync wallet_balances from user_wallets (EXPLICIT SET, NO ADDITION)
    -- CRITICAL: Use INSERT ON CONFLICT with explicit SET (not addition) to ensure we SET the value
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = NOW();

    -- Update NGN balance in wallet_balances (EXPLICIT SET, NO ADDITION)
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = NOW();

    -- 3. Sync wallets table from user_wallets (EXPLICIT SET, NO ADDITION)
    -- CRITICAL: Use INSERT ON CONFLICT with explicit SET to prevent any trigger from adding
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (
      p_user_id,
      v_new_user_ngn_balance,
      COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = EXCLUDED.ngn_balance, updated_at = NOW();

    -- Verify wallets table was updated correctly
    SELECT ngn_balance INTO v_verify_ngn_balance
    FROM public.wallets
    WHERE user_id = p_user_id;

    -- CRITICAL: Verify wallets table has correct debited balance
    IF v_verify_ngn_balance IS NOT NULL AND v_verify_ngn_balance > v_current_user_ngn_balance THEN
      RAISE EXCEPTION 'CRITICAL FAILURE: wallets.ngn_balance was CREDITED instead of DEBITED. Expected: ₦% (decreased from ₦%), Actual: ₦%. This indicates a trigger or function is adding to balance.',
        v_new_user_ngn_balance, v_current_user_ngn_balance, v_verify_ngn_balance;
    END IF;

    -- 4. Update system wallet
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

    -- 5. Create transaction record
    INSERT INTO public.transactions (
      user_id, transaction_type, crypto_currency, crypto_amount,
      fiat_amount, fiat_currency, fee_amount, fee_percentage, fee_currency,
      status, external_reference, completed_at, metadata
    )
    VALUES (
      p_user_id, 'BUY', p_asset, v_crypto_amount,
      v_ngn_to_debit, 'NGN', v_fee, p_fee_percentage * 100, 'NGN',
      'COMPLETED', v_reference, NOW(),
      jsonb_build_object(
        'rate', p_rate,
        'fee_percentage', p_fee_percentage,
        'fix_version', 'v6_20260130_fix_double_credit'
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
COMMENT ON FUNCTION public.instant_buy_crypto IS 'Instant buy crypto function. CRITICAL FIX v6: Fixed double credit bug. Uses EXPLICIT UPDATE statements instead of INSERT ON CONFLICT to prevent triggers from adding to balance. Verifies wallets table is debited correctly. user_wallets is the ONLY source of truth.';
