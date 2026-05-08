-- CRITICAL FIX: Enforce EXACT formula NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE
-- Issue: User sold 0.01764695 SOL at ₦160,083.75 per SOL
--        Expected: 0.01764695 × 160,083.75 = ₦2,824.99
--        Actual: User was credited ₦394,135.48 (WRONG VARIABLE USED)
-- Root Cause: Function used wrong variable (total balance, system inventory, or cached value) instead of crypto_amount_sold
-- Fix: Use EXACTLY p_amount (crypto_amount_sold) × p_rate (sell_price) for NGN credit
--      Use SAME p_amount for debiting crypto and crediting NGN
--      Wrap everything in single atomic transaction
--      Add validation and logging

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
  -- For wallet_balances table (crypto balances only)
  v_current_asset_from_wallet_balances DECIMAL(20, 8);
  -- CRITICAL: Store the EXACT crypto_amount_sold used in transaction
  v_crypto_amount_sold DECIMAL(20, 8);
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

  -- Validate rate (sell price)
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 
      'Sell price (rate) must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Store the EXACT crypto_amount_sold - this is the ONLY value we'll use
  -- This ensures we use the SAME value for debiting crypto and crediting NGN
  v_crypto_amount_sold := p_amount;

  -- Check max sell per transaction
  IF p_max_sell_per_transaction IS NOT NULL AND v_crypto_amount_sold > p_max_sell_per_transaction THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Amount exceeds maximum sell per transaction: %s', p_max_sell_per_transaction)::TEXT;
    RETURN;
  END IF;

  -- Load user wallet from user_wallets WITH LOCK to prevent race conditions
  -- This ensures we read the most current balance atomically
  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create user wallet if it doesn't exist
    INSERT INTO public.user_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_user_wallet;
  END IF;

  -- Load system wallet WITH LOCK
  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

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

  -- Also check wallet_balances table for crypto balance (use maximum for crypto only)
  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  -- Use maximum balance from both tables for crypto (not NGN)
  v_user_asset_balance := GREATEST(v_user_asset_balance, v_current_asset_from_wallet_balances);

  -- MANDATORY SAFETY GUARD: Confirm user crypto balance >= crypto_amount_sold
  IF v_user_asset_balance < v_crypto_amount_sold THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient balance. Current: %s %s, Requested: %s %s',
        v_user_asset_balance, p_asset, v_crypto_amount_sold, p_asset)::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Calculate NGN using EXACT formula: NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE
  -- MUST use v_crypto_amount_sold (the EXACT amount sold) and p_rate (sell price)
  -- NO OTHER VARIABLES ALLOWED - not total balance, not system inventory, not cached values
  v_total_ngn_before_fee := v_crypto_amount_sold * p_rate;
  
  -- Calculate fee
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  
  -- Calculate NGN amount after fee
  v_ngn_amount := v_total_ngn_before_fee - v_fee;

  -- Ensure v_ngn_amount is exactly what we calculated (no rounding errors)
  -- Round to 2 decimal places for NGN
  v_ngn_amount := ROUND(v_ngn_amount, 2);
  v_fee := ROUND(v_fee, 2);

  -- MANDATORY SAFETY GUARD: Confirm sell price is valid (already validated above)
  -- MANDATORY SAFETY GUARD: Check system liquidity (NGN float balance)
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
  -- CRITICAL: Debit EXACTLY v_crypto_amount_sold from user's crypto balance
  v_new_user_asset_balance := v_user_asset_balance - v_crypto_amount_sold;
  
  -- CRITICAL: Read current NGN balance from locked row (most current value)
  -- ALWAYS use user_wallets.ngn_balance as PRIMARY source of truth
  -- NEVER check wallet_balances or wallets tables for NGN balance
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);
  
  -- CRITICAL: Credit EXACTLY v_ngn_amount to user's NGN balance
  -- This uses the EXACT formula: crypto_amount_sold × sell_price (after fee)
  v_new_user_ngn_balance := v_current_user_ngn_balance + v_ngn_amount;
  
  -- Round to 2 decimal places for NGN
  v_new_user_ngn_balance := ROUND(v_new_user_ngn_balance, 2);

  -- Get new system asset inventory
  -- CRITICAL: Add EXACTLY v_crypto_amount_sold to system inventory
  CASE p_asset
    WHEN 'BTC' THEN 
      v_new_system_asset_inventory := v_system_wallet.btc_inventory + v_crypto_amount_sold;
    WHEN 'ETH' THEN 
      v_new_system_asset_inventory := v_system_wallet.eth_inventory + v_crypto_amount_sold;
    WHEN 'USDT' THEN 
      v_new_system_asset_inventory := v_system_wallet.usdt_inventory + v_crypto_amount_sold;
    WHEN 'USDC' THEN 
      v_new_system_asset_inventory := v_system_wallet.usdc_inventory + v_crypto_amount_sold;
    WHEN 'XRP' THEN 
      v_new_system_asset_inventory := v_system_wallet.xrp_inventory + v_crypto_amount_sold;
    WHEN 'SOL' THEN 
      v_new_system_asset_inventory := v_system_wallet.sol_inventory + v_crypto_amount_sold;
  END CASE;

  -- Generate reference
  v_reference := 'SELL_' || UPPER(p_asset) || '_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '_' || SUBSTRING(p_user_id::TEXT, 1, 8);

  -- MANDATORY ATOMIC TRANSACTION: All operations in single transaction
  -- If any step fails, entire operation rolls back
  BEGIN
    -- LOGGING: Log before committing (for debugging)
    RAISE NOTICE 'SELL TRANSACTION START: crypto_amount_sold=%, sell_price=%, calculated_ngn_amount=%, user_crypto_balance_before=%',
      v_crypto_amount_sold, p_rate, v_ngn_amount, v_user_asset_balance;

    -- 1. Update user_wallets table - debit EXACTLY v_crypto_amount_sold, credit EXACTLY v_ngn_amount
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
    -- Update crypto balance - debit EXACTLY v_crypto_amount_sold
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_asset, v_new_user_asset_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_asset_balance, updated_at = NOW();

    -- Update NGN balance - credit EXACTLY v_ngn_amount (use SAME value as user_wallets)
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 3. Update wallets table (app reads from here first)
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (p_user_id, v_new_user_ngn_balance, COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 4. Update system wallet - debit EXACTLY v_ngn_amount, credit EXACTLY v_crypto_amount_sold
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

    -- 5. Insert transaction record with EXACT SAME values used in calculations
    -- CRITICAL: Use v_crypto_amount_sold (the EXACT amount sold) and v_ngn_amount (calculated from same)
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
      v_crypto_amount_sold, -- EXACT crypto amount sold (SAME as used in NGN calculation)
      'NGN',
      v_ngn_amount, -- EXACT NGN amount (calculated from v_crypto_amount_sold × p_rate)
      'COMPLETED',
      v_reference,
      NOW(),
      jsonb_build_object(
        'type', 'sell',
        'asset', p_asset,
        'crypto_amount_sold', v_crypto_amount_sold, -- EXACT amount sold
        'sell_price', p_rate, -- Sell price per unit
        'ngn_amount', v_ngn_amount, -- Calculated: crypto_amount_sold × sell_price (after fee)
        'total_ngn_before_fee', v_total_ngn_before_fee,
        'fee', v_fee,
        'fee_percentage', p_fee_percentage,
        'reference', v_reference,
        'instant_sell', true,
        'formula_used', 'NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE',
        'fix_version', 'v4_20260130_exact_formula'
      )
    )
    RETURNING id INTO v_transaction_id;

    -- LOGGING: Log after committing (for debugging)
    RAISE NOTICE 'SELL TRANSACTION SUCCESS: transaction_id=%, crypto_amount_sold=%, sell_price=%, ngn_credited=%, user_ngn_balance_after=%',
      v_transaction_id, v_crypto_amount_sold, p_rate, v_ngn_amount, v_new_user_ngn_balance;

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
        'sol_balance', CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE COALESCE(v_user_wallet.sol_balance, 0) END,
        'transaction_id', v_transaction_id,
        'crypto_amount_sold', v_crypto_amount_sold,
        'sell_price', p_rate,
        'ngn_amount', v_ngn_amount
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    -- LOGGING: Log error
    RAISE NOTICE 'SELL TRANSACTION FAILED: error=%, crypto_amount_sold=%, sell_price=%', SQLERRM, v_crypto_amount_sold, p_rate;
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
COMMENT ON FUNCTION public.instant_sell_crypto_v2 IS 'Instant sell crypto function. CRITICAL FIX v4: Enforces EXACT formula NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE. Uses SAME crypto_amount_sold for debiting crypto and crediting NGN. All operations in single atomic transaction. Uses SELECT FOR UPDATE to lock rows. Uses user_wallets.ngn_balance as PRIMARY source of truth. Includes validation guards and logging.';
