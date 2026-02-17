-- CRITICAL FIX: Ensure instant_sell_crypto (v1) ALWAYS credits user NGN wallet exactly the amount sold
-- Issue: Need to guarantee that users receive exactly (amount * rate * (1 - fee)) in NGN
-- Fix: Use SELECT FOR UPDATE to lock rows, read current balance atomically, and credit exactly v_ngn_to_credit
--      Use user_wallets.ngn_balance as PRIMARY source of truth for NGN balance
--      This prevents any race conditions or incorrect balance reads

CREATE OR REPLACE FUNCTION public.instant_sell_crypto(
  p_user_id UUID,
  p_crypto_currency TEXT,
  p_crypto_amount DECIMAL(20, 8),
  p_price_per_unit DECIMAL(20, 2),
  p_platform_fee_percentage DECIMAL(5, 4) DEFAULT 0.01
)
RETURNS TABLE(
  success BOOLEAN,
  ngn_credited DECIMAL(20, 2),
  platform_fee DECIMAL(20, 2),
  new_crypto_balance DECIMAL(20, 8),
  new_ngn_balance DECIMAL(20, 2),
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_crypto_balance DECIMAL(20, 8);
  v_current_user_ngn_balance DECIMAL(20, 2);
  v_user_wallet RECORD;
  v_system_wallet RECORD;
  v_total_ngn_before_fee DECIMAL(20, 2);
  v_platform_fee DECIMAL(20, 2);
  v_ngn_to_credit DECIMAL(20, 2);
  v_new_user_crypto_balance DECIMAL(20, 8);
  v_new_user_ngn_balance DECIMAL(20, 2);
BEGIN
  -- Validate inputs
  IF p_crypto_currency IS NULL OR p_crypto_currency = '' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Crypto currency is required'::TEXT;
    RETURN;
  END IF;

  IF p_crypto_amount IS NULL OR p_crypto_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Crypto amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_price_per_unit IS NULL OR p_price_per_unit <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Price per unit must be greater than 0'::TEXT;
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

  -- Get user crypto balance WITH LOCK from wallet_balances (for compatibility)
  SELECT COALESCE(balance, 0) INTO v_user_crypto_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_crypto_currency
  FOR UPDATE;

  -- Also check user_wallets for crypto balance and use maximum
  CASE p_crypto_currency
    WHEN 'BTC' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.btc_balance, 0));
    WHEN 'ETH' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.eth_balance, 0));
    WHEN 'USDT' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.usdt_balance, 0));
    WHEN 'USDC' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.usdc_balance, 0));
    WHEN 'XRP' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.xrp_balance, 0));
    WHEN 'SOL' THEN v_user_crypto_balance := GREATEST(v_user_crypto_balance, COALESCE(v_user_wallet.sol_balance, 0));
  END CASE;

  -- Check if crypto balance exists
  IF v_user_crypto_balance IS NULL OR v_user_crypto_balance = 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 
      format('Insufficient balance. No balance found for %s', p_crypto_currency)::TEXT;
    RETURN;
  END IF;

  -- Check if sufficient crypto balance
  IF v_user_crypto_balance < p_crypto_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      format('Insufficient balance. Current: %s %s, Requested: %s %s', 
        v_user_crypto_balance, p_crypto_currency, p_crypto_amount, p_crypto_currency)::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Read current NGN balance from locked user_wallets row (PRIMARY source of truth)
  -- ALWAYS use user_wallets.ngn_balance as PRIMARY source of truth
  -- NEVER check wallet_balances or wallets tables for NGN balance to prevent using incorrect balances
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);

  -- Get system wallet WITH LOCK
  SELECT * INTO v_system_wallet
  FROM public.system_wallet
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate EXACT amounts - this is the amount that will be credited to user
  v_total_ngn_before_fee := p_crypto_amount * p_price_per_unit;
  v_platform_fee := v_total_ngn_before_fee * p_platform_fee_percentage;
  v_ngn_to_credit := v_total_ngn_before_fee - v_platform_fee;

  -- Ensure v_ngn_to_credit is exactly what we calculated (no rounding errors)
  -- Round to 2 decimal places for NGN
  v_ngn_to_credit := ROUND(v_ngn_to_credit, 2);
  v_platform_fee := ROUND(v_platform_fee, 2);

  v_new_user_crypto_balance := v_user_crypto_balance - p_crypto_amount;
  
  -- CRITICAL: Credit EXACTLY v_ngn_to_credit to user's NGN balance
  -- This ensures the user receives exactly the amount they sold (after fees)
  v_new_user_ngn_balance := v_current_user_ngn_balance + v_ngn_to_credit;
  
  -- Round to 2 decimal places for NGN
  v_new_user_ngn_balance := ROUND(v_new_user_ngn_balance, 2);

  -- Check system liquidity
  IF v_system_wallet.ngn_float_balance < v_ngn_to_credit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      format('System liquidity low. Available: ₦%s, Required: ₦%s', 
        v_system_wallet.ngn_float_balance, v_ngn_to_credit)::TEXT;
    RETURN;
  END IF;

  -- Perform atomic swap: debit user crypto, credit user NGN, update system wallet
  BEGIN
    -- 1. Update user_wallets table - credit EXACTLY v_ngn_to_credit
    UPDATE public.user_wallets
    SET
      ngn_balance = v_new_user_ngn_balance,
      btc_balance = CASE WHEN p_crypto_currency = 'BTC' THEN v_new_user_crypto_balance ELSE btc_balance END,
      eth_balance = CASE WHEN p_crypto_currency = 'ETH' THEN v_new_user_crypto_balance ELSE eth_balance END,
      usdt_balance = CASE WHEN p_crypto_currency = 'USDT' THEN v_new_user_crypto_balance ELSE usdt_balance END,
      usdc_balance = CASE WHEN p_crypto_currency = 'USDC' THEN v_new_user_crypto_balance ELSE usdc_balance END,
      xrp_balance = CASE WHEN p_crypto_currency = 'XRP' THEN v_new_user_crypto_balance ELSE xrp_balance END,
      sol_balance = CASE WHEN p_crypto_currency = 'SOL' THEN v_new_user_crypto_balance ELSE sol_balance END,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user_wallets';
    END IF;

    -- 2. Update wallet_balances table (for app compatibility)
    -- Update crypto balance
    UPDATE public.wallet_balances
    SET
      balance = v_new_user_crypto_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_crypto_currency;

    IF NOT FOUND THEN
      -- Create crypto balance if it doesn't exist
      INSERT INTO public.wallet_balances (user_id, currency, balance, created_at, updated_at)
      VALUES (p_user_id, p_crypto_currency, v_new_user_crypto_balance, NOW(), NOW())
      ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = v_new_user_crypto_balance, updated_at = NOW();
    END IF;

    -- Update NGN balance - use EXACTLY the same value as user_wallets
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'NGN', v_new_user_ngn_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = v_new_user_ngn_balance, updated_at = NOW();

    -- 3. Update wallets table (for backward compatibility) - use EXACTLY the same value
    UPDATE public.wallets
    SET
      ngn_balance = v_new_user_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 4. Update system wallet: add crypto to inventory, debit EXACTLY v_ngn_to_credit
    UPDATE public.system_wallet
    SET
      btc_inventory = CASE 
        WHEN p_crypto_currency = 'BTC' THEN btc_inventory + p_crypto_amount 
        ELSE btc_inventory 
      END,
      eth_inventory = CASE 
        WHEN p_crypto_currency = 'ETH' THEN eth_inventory + p_crypto_amount 
        ELSE eth_inventory 
      END,
      usdt_inventory = CASE 
        WHEN p_crypto_currency = 'USDT' THEN usdt_inventory + p_crypto_amount 
        ELSE usdt_inventory 
      END,
      usdc_inventory = CASE 
        WHEN p_crypto_currency = 'USDC' THEN usdc_inventory + p_crypto_amount 
        ELSE usdc_inventory 
      END,
      xrp_inventory = CASE 
        WHEN p_crypto_currency = 'XRP' THEN xrp_inventory + p_crypto_amount 
        ELSE xrp_inventory 
      END,
      sol_inventory = CASE 
        WHEN p_crypto_currency = 'SOL' THEN sol_inventory + p_crypto_amount 
        ELSE sol_inventory 
      END,
      ngn_float_balance = ngn_float_balance - v_ngn_to_credit,
      updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000000'::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'System wallet not found';
    END IF;

    -- Return success with EXACT amounts
    RETURN QUERY SELECT 
      true,
      v_ngn_to_credit,
      v_platform_fee,
      v_new_user_crypto_balance,
      v_new_user_ngn_balance,
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    RETURN QUERY SELECT 
      false,
      0::DECIMAL,
      0::DECIMAL,
      0::DECIMAL,
      0::DECIMAL,
      SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.instant_sell_crypto(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.instant_sell_crypto IS 'Atomically swaps crypto to NGN instantly using system wallet. CRITICAL FIX v3: ALWAYS credits user EXACTLY (amount * rate * (1 - fee)) in NGN. Uses SELECT FOR UPDATE to lock rows and prevent race conditions. Uses user_wallets.ngn_balance as PRIMARY source of truth for NGN balance. Updates user_wallets, wallet_balances, and wallets tables consistently with exact amounts. Debits user crypto, credits user NGN, moves crypto to system inventory, and debits system NGN float balance. Checks system liquidity before execution. No blockchain or exchange API calls.';
