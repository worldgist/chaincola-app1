-- Add validation and logging to catch sell calculation bugs
-- This migration adds safety checks to ensure the correct amount is used

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
  v_current_user_asset_balance DECIMAL(20, 8);
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_current_system_asset_inventory DECIMAL(20, 8);
  v_current_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
  -- CRITICAL: Store the EXACT crypto_amount_sold used in transaction
  v_crypto_amount_sold DECIMAL(20, 8);
BEGIN
  -- Validate inputs
  IF p_asset IS NULL OR p_asset = '' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Asset is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Invalid sell price'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Store the EXACT amount sold IMMEDIATELY - this is the ONLY value we'll use
  -- This prevents any accidental use of balance variables instead of the amount sold
  v_crypto_amount_sold := p_amount;

  -- SAFETY CHECK: Log the input parameters to catch bugs
  RAISE NOTICE 'SELL REQUEST: user_id=%, asset=%, p_amount=%, p_rate=%, v_crypto_amount_sold=%', 
    p_user_id, p_asset, p_amount, p_rate, v_crypto_amount_sold;

  -- Lock user wallet row
  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'User wallet not found'::TEXT;
    RETURN;
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

  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);

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

  -- SAFETY CHECK: Log balances to catch bugs
  RAISE NOTICE 'BALANCES: user_%_balance=%, user_ngn_balance=%, v_crypto_amount_sold=%', 
    p_asset, v_current_user_asset_balance, v_current_user_ngn_balance, v_crypto_amount_sold;

  -- Check user has sufficient crypto balance
  IF v_current_user_asset_balance < v_crypto_amount_sold THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient %s balance. Current: %s, Required: %s', 
        p_asset, v_current_user_asset_balance, v_crypto_amount_sold)::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Calculate NGN using EXACT formula: crypto_amount_sold × sell_price
  -- MUST use v_crypto_amount_sold (the EXACT amount sold) and p_rate (sell price)
  -- NO OTHER VARIABLES ALLOWED - not total balance, not system inventory, not cached values
  v_total_ngn_before_fee := ROUND(v_crypto_amount_sold * p_rate, 2);
  v_fee := ROUND(v_total_ngn_before_fee * p_fee_percentage, 2);
  v_ngn_amount := ROUND(v_total_ngn_before_fee - v_fee, 2);

  -- SAFETY CHECK: Validate calculation makes sense
  -- If the calculated NGN amount is more than 10x what it should be, something is wrong
  -- Expected max: crypto_amount_sold × rate × 1.1 (with some margin)
  -- If actual is way higher, log warning
  IF v_ngn_amount > (v_crypto_amount_sold * p_rate * 1.1) THEN
    RAISE WARNING 'POTENTIAL BUG: Calculated NGN amount (%) seems too high for crypto amount (%) × rate (%)', 
      v_ngn_amount, v_crypto_amount_sold, p_rate;
  END IF;

  -- SAFETY CHECK: Log calculation details
  RAISE NOTICE 'CALCULATION: v_crypto_amount_sold=%, p_rate=%, v_total_ngn_before_fee=%, v_fee=%, v_ngn_amount=%', 
    v_crypto_amount_sold, p_rate, v_total_ngn_before_fee, v_fee, v_ngn_amount;

  -- Check system liquidity
  IF v_current_system_ngn_balance < v_ngn_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System liquidity low. Available: ₦%s, Required: ₦%s', 
        v_current_system_ngn_balance, v_ngn_amount)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balances
  v_new_user_asset_balance := ROUND(v_current_user_asset_balance - v_crypto_amount_sold, 8);
  v_new_user_ngn_balance := ROUND(v_current_user_ngn_balance + v_ngn_amount, 2);
  v_new_system_asset_inventory := ROUND(v_current_system_asset_inventory + v_crypto_amount_sold, 8);
  v_new_system_ngn_balance := ROUND(v_current_system_ngn_balance - v_ngn_amount, 2);

  -- Safety guard: NGN balance must increase
  IF v_new_user_ngn_balance <= v_current_user_ngn_balance THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('CRITICAL ERROR: NGN balance would not increase. Current: ₦%s, New: ₦%s', 
        v_current_user_ngn_balance, v_new_user_ngn_balance)::TEXT;
    RETURN;
  END IF;

  -- Generate reference
  v_reference := format('SELL_%s_%s_%s', p_asset, p_user_id, EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- ATOMIC TRANSACTION: Update ONLY user_wallets first (source of truth)
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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user_wallets';
    END IF;

    -- Sync wallet_balances from user_wallets (NO MULTIPLICATION - just copy values)
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = NOW();

    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = NOW();

    -- Sync wallets table from user_wallets (NO MULTIPLICATION - just copy value)
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (
      p_user_id,
      v_new_user_ngn_balance,
      COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = EXCLUDED.ngn_balance, updated_at = NOW();

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

    -- Create transaction record with detailed metadata for debugging
    INSERT INTO public.transactions (
      user_id, transaction_type, crypto_currency, crypto_amount,
      fiat_amount, fiat_currency, fee_amount, fee_percentage, fee_currency,
      status, external_reference, completed_at, metadata
    )
    VALUES (
      p_user_id, 'SELL', p_asset, v_crypto_amount_sold,
      v_ngn_amount, 'NGN', v_fee, p_fee_percentage * 100, 'NGN',
      'COMPLETED', v_reference, NOW(),
      jsonb_build_object(
        'rate', p_rate,
        'fee_percentage', p_fee_percentage,
        'crypto_amount_sold', v_crypto_amount_sold,
        'total_ngn_before_fee', v_total_ngn_before_fee,
        'fix_version', 'v6_20260130_add_validation_logging'
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Log success
    RAISE NOTICE 'SELL SUCCESS: transaction_id=%, crypto_amount_sold=%, rate=%, ngn_credited=%', 
      v_transaction_id, v_crypto_amount_sold, p_rate, v_ngn_amount;

    -- Return success
    RETURN QUERY SELECT 
      true,
      v_ngn_amount,
      jsonb_build_object(
        'ngn_balance', v_new_user_ngn_balance,
        'crypto_balance', v_new_user_asset_balance,
        'crypto_symbol', p_asset,
        'transaction_id', v_transaction_id
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SELL FAILED: error=%, crypto_amount_sold=%, rate=%', SQLERRM, v_crypto_amount_sold, p_rate;
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
COMMENT ON FUNCTION public.instant_sell_crypto_v2 IS 'Instant sell crypto function. CRITICAL FIX v6: Added validation and logging to catch calculation bugs. Uses EXACT formula: NGN = crypto_amount_sold × sell_price. Logs all calculations for debugging.';
