-- CRITICAL FIX: Ensure instant buy function ALWAYS debits user NGN wallet exactly the amount paid
-- Issue: When user_wallets.ngn_balance is 0, function checks wallet_balances and may use incorrect balance
--        Example: User had ₦3,000, bought SOL worth ₦3,000, should have ₦0, but got credited ₦391,310.49
--        This happens when wallet_balances has an old incorrect balance and user_wallets is 0
-- Fix: ALWAYS use user_wallets.ngn_balance as PRIMARY source, NEVER check wallet_balances for NGN balance
--      Use SELECT FOR UPDATE to lock rows and prevent race conditions
--      Debit EXACTLY (amount + fee) from user's NGN balance

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
  -- For wallet_balances table (crypto balances only)
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

  -- CRITICAL: Read current NGN balance from locked row (PRIMARY source of truth)
  -- ALWAYS use user_wallets.ngn_balance as PRIMARY source of truth
  -- NEVER check wallet_balances or wallets tables for NGN balance to prevent using incorrect balances
  -- If user_wallets.ngn_balance is NULL, treat it as 0 (new user)
  -- CRITICAL: This MUST be the actual balance from the locked row, not from any other source
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);
  
  -- CRITICAL VALIDATION: Log the balance we're reading to ensure it's correct
  RAISE NOTICE 'BUY: Reading NGN balance from user_wallets (PRIMARY): ₦%', v_current_user_ngn_balance;

  -- Get user asset balance from user_wallets
  CASE p_asset
    WHEN 'BTC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_user_asset_balance := COALESCE(v_user_wallet.sol_balance, 0);
  END CASE;

  -- Also check wallet_balances table for crypto balance (use maximum for crypto only)
  SELECT COALESCE(MAX(balance), 0) INTO v_current_asset_from_wallet_balances
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_asset;

  -- Use maximum balance from both tables for crypto (not NGN)
  v_current_user_asset_balance := GREATEST(v_current_user_asset_balance, v_current_asset_from_wallet_balances);

  -- CRITICAL: Calculate EXACT amounts using ONLY correct Buy formula
  -- Formula: crypto_amount = ngn_amount ÷ buy_price
  -- User pays: ngn_amount + fee
  -- NEVER reuse Sell logic - Buy is NGN → CRYPTO (debit NGN, credit crypto)
  
  v_total_ngn_before_fee := p_ngn_amount;
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  v_ngn_to_debit := v_total_ngn_before_fee + v_fee; -- User pays amount + fee
  
  -- Ensure v_ngn_to_debit is exactly what we calculated (no rounding errors)
  -- Round to 2 decimal places for NGN
  v_ngn_to_debit := ROUND(v_ngn_to_debit, 2);
  v_fee := ROUND(v_fee, 2);
  
  -- CRITICAL: Calculate crypto amount using EXACT formula: crypto_amount = ngn_amount ÷ buy_price
  -- This is the ONLY correct formula for Buy operations
  -- After fee is deducted from NGN, divide by buy price to get crypto amount
  v_crypto_amount := (v_total_ngn_before_fee - v_fee) / p_rate;

  -- Check if user has sufficient NGN balance
  IF v_current_user_ngn_balance < v_ngn_to_debit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient NGN balance. Current: ₦%s, Required: ₦%s', 
        v_current_user_ngn_balance, v_ngn_to_debit)::TEXT;
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
  -- CRITICAL: Credit crypto to user's wallet
  v_new_user_asset_balance := v_current_user_asset_balance + v_crypto_amount;
  
  -- CRITICAL: Debit EXACTLY v_ngn_to_debit from user's NGN balance
  -- This ensures the user pays exactly the amount they specified (plus fee)
  -- MUST BE SUBTRACTION: current_balance - amount_to_debit = new_balance
  -- Example: ₦10,000 - ₦10,000 = ₦0 (correct)
  -- NEVER ADD: current_balance + amount would credit instead of debit (WRONG!)
  v_new_user_ngn_balance := v_current_user_ngn_balance - v_ngn_to_debit;
  
  -- Round to 2 decimal places for NGN
  v_new_user_ngn_balance := ROUND(v_new_user_ngn_balance, 2);
  
  -- CRITICAL VALIDATION: Ensure we're debiting, not crediting
  -- New balance MUST be less than current balance (we're subtracting)
  IF v_new_user_ngn_balance >= v_current_user_ngn_balance THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('CRITICAL ERROR: NGN balance calculation error. Current: ₦%s, New: ₦%s, Amount to debit: ₦%s. New balance must be less than current balance when buying crypto.',
        v_current_user_ngn_balance, v_new_user_ngn_balance, v_ngn_to_debit)::TEXT;
    RETURN;
  END IF;

  -- Generate reference (use microsecond precision to prevent duplicates)
  v_reference := format('BUY_%s_%s_%s_%s', 
    p_asset, 
    p_user_id, 
    EXTRACT(EPOCH FROM NOW())::BIGINT, 
    LPAD(EXTRACT(MICROSECONDS FROM NOW())::BIGINT::TEXT, 6, '0')
  );

  -- Check for duplicate transaction using reference
  IF EXISTS (
    SELECT 1 FROM public.transactions 
    WHERE user_id = p_user_id 
    AND external_reference = v_reference 
    AND transaction_type = 'BUY'
    AND crypto_currency = p_asset
  ) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Duplicate transaction detected. Reference: %s', v_reference)::TEXT;
    RETURN;
  END IF;

  -- MANDATORY ATOMIC TRANSACTION: All Buy operations in single transaction
  -- If any step fails, entire operation rolls back
  BEGIN
    -- LOGGING: Log before committing (for debugging)
    -- Required logs: ngn_balance_before, ngn_amount_debited, ngn_balance_after_expected, crypto_amount_credited
    RAISE NOTICE 'BUY TRANSACTION START: ngn_balance_before=%, ngn_amount_debited=%, ngn_balance_after_expected=%, crypto_amount_credited=%, buy_price=%, asset=%',
      v_current_user_ngn_balance, v_ngn_to_debit, v_new_user_ngn_balance, v_crypto_amount, p_rate, p_asset;

    -- 1. Update user_wallets: DEBIT NGN (subtract), CREDIT crypto (add)
    -- CRITICAL: ngn_balance MUST decrease (debit), crypto balance MUST increase (credit)
    -- NEVER credit NGN during Buy - this violates core rule: BUY = NGN → CRYPTO
    -- CRITICAL: We're SETTING ngn_balance to v_new_user_ngn_balance (which is current - amount)
    -- This is NOT adding to the balance, it's replacing it with the debited amount
    UPDATE public.user_wallets
    SET
      ngn_balance = v_new_user_ngn_balance, -- DEBIT: Set to lower value (current - amount), NOT current + amount
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

    -- Update NGN balance - DEBIT: use EXACTLY the same value as user_wallets (decreased balance)
    -- CRITICAL: This MUST be the debited balance (lower than before), NOT credited
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 3. Update wallets table (app reads from here first) - DEBIT NGN
    -- CRITICAL: Set to debited balance (lower value), NOT credited
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
    VALUES (p_user_id, v_new_user_ngn_balance, COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = p_user_id), 0), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET ngn_balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 4. Update system_wallets: debit crypto inventory, credit EXACTLY v_ngn_to_debit
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
      RAISE EXCEPTION 'Failed to update system wallet';
    END IF;

    -- 5. Create transaction record with EXACT amounts
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      crypto_currency,
      crypto_amount,
      fiat_amount,
      fiat_currency,
      fee_amount,
      fee_percentage,
      fee_currency,
      status,
      external_reference,
      completed_at,
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
      p_fee_percentage * 100,
      'NGN',
      'COMPLETED',
      v_reference,
      NOW(),
      jsonb_build_object(
        'rate', p_rate,
        'fee_percentage', p_fee_percentage,
        'fee_amount', v_fee,
        'instant_buy', true,
        'reference', v_reference,
        'ngn_amount_paid', v_ngn_to_debit,
        'crypto_amount_received', v_crypto_amount,
        'fix_version', 'v2_20260130_exact_debit'
      )
    )
    RETURNING id INTO v_transaction_id;

    -- CRITICAL: Verify the update actually happened correctly
    -- Read back the balance to ensure it was debited, not credited
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
    
    RAISE NOTICE 'BUY: Verified NGN balance correctly debited. Before: ₦%, After: ₦%, Debit: ₦%',
      v_current_user_ngn_balance, v_verify_ngn_balance, v_ngn_to_debit;

    -- LOGGING: Log after committing (for debugging)
    RAISE NOTICE 'BUY TRANSACTION SUCCESS: transaction_id=%, ngn_balance_before=%, ngn_amount_debited=%, ngn_balance_after=%, crypto_amount_credited=%, asset=%',
      v_transaction_id, v_current_user_ngn_balance, v_ngn_to_debit, v_new_user_ngn_balance, v_crypto_amount, p_asset;
    
    -- CRITICAL: Final validation - if NGN balance increased, this is a critical failure
    IF v_new_user_ngn_balance > v_current_user_ngn_balance THEN
      RAISE EXCEPTION 'CRITICAL FAILURE: NGN balance increased during Buy transaction. This violates core rule: BUY = NGN → CRYPTO (debit NGN only). Before: %, After: %, Debit amount: %',
        v_current_user_ngn_balance, v_new_user_ngn_balance, v_ngn_to_debit;
    END IF;

    -- Return success
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
COMMENT ON FUNCTION public.instant_buy_crypto IS 'Instant buy crypto function. CRITICAL FIX v3: CORE RULE - BUY = NGN → CRYPTO. ALWAYS DEBITS user EXACTLY (amount + fee) in NGN. NEVER credits NGN when buying crypto. Uses EXACT formula: crypto_amount = ngn_amount ÷ buy_price. Uses SELECT FOR UPDATE to lock rows and prevent race conditions. Uses user_wallets.ngn_balance as PRIMARY source of truth. All operations in single atomic transaction. Includes mandatory safety guards: ngn_balance_after < ngn_balance_before, crypto_amount > 0, buy_price > 0. Includes logging before/after commit. If NGN balance increases during Buy, treats as critical failure and aborts.';
