-- CRITICAL FIX: Enforce EXACT formula NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE (v1 function)
-- Issue: User sold 0.01764695 SOL at ₦160,083.75 per SOL
--        Expected: 0.01764695 × 160,083.75 = ₦2,824.99
--        Actual: User was credited ₦394,135.48 (WRONG VARIABLE USED)
-- Root Cause: Function used wrong variable (total balance, system inventory, or cached value) instead of crypto_amount_sold
-- Fix: Use EXACTLY p_crypto_amount (crypto_amount_sold) × p_price_per_unit (sell_price) for NGN credit
--      Use SAME p_crypto_amount for debiting crypto and crediting NGN
--      Wrap everything in single atomic transaction
--      Add validation and logging

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
  -- CRITICAL: Store the EXACT crypto_amount_sold used in transaction
  v_crypto_amount_sold DECIMAL(20, 8);
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
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Price per unit (sell price) must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Store the EXACT crypto_amount_sold - this is the ONLY value we'll use
  -- This ensures we use the SAME value for debiting crypto and crediting NGN
  v_crypto_amount_sold := p_crypto_amount;

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

  -- MANDATORY SAFETY GUARD: Confirm user crypto balance >= crypto_amount_sold
  IF v_user_crypto_balance < v_crypto_amount_sold THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      format('Insufficient balance. Current: %s %s, Requested: %s %s', 
        v_user_crypto_balance, p_crypto_currency, v_crypto_amount_sold, p_crypto_currency)::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Read current NGN balance from locked user_wallets row (PRIMARY source of truth)
  -- ALWAYS use user_wallets.ngn_balance as PRIMARY source of truth
  -- NEVER check wallet_balances or wallets tables for NGN balance to prevent using incorrect balances
  v_current_user_ngn_balance := COALESCE(v_user_wallet.ngn_balance, 0);

  -- Get system wallet WITH LOCK
  -- CRITICAL: Use correct table name system_wallets (plural) and id = 1 (INTEGER, not UUID)
  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL: Calculate NGN using EXACT formula: NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE
  -- MUST use v_crypto_amount_sold (the EXACT amount sold) and p_price_per_unit (sell price)
  -- NO OTHER VARIABLES ALLOWED - not total balance, not system inventory, not cached values
  v_total_ngn_before_fee := v_crypto_amount_sold * p_price_per_unit;
  
  -- Calculate platform fee
  v_platform_fee := v_total_ngn_before_fee * p_platform_fee_percentage;
  
  -- Calculate NGN to credit after fee
  v_ngn_to_credit := v_total_ngn_before_fee - v_platform_fee;

  -- Ensure v_ngn_to_credit is exactly what we calculated (no rounding errors)
  -- Round to 2 decimal places for NGN
  v_ngn_to_credit := ROUND(v_ngn_to_credit, 2);
  v_platform_fee := ROUND(v_platform_fee, 2);

  -- CRITICAL: Debit EXACTLY v_crypto_amount_sold from user's crypto balance
  v_new_user_crypto_balance := v_user_crypto_balance - v_crypto_amount_sold;
  
  -- CRITICAL: Credit EXACTLY v_ngn_to_credit to user's NGN balance
  -- This uses the EXACT formula: crypto_amount_sold × sell_price (after fee)
  v_new_user_ngn_balance := v_current_user_ngn_balance + v_ngn_to_credit;
  
  -- Round to 2 decimal places for NGN
  v_new_user_ngn_balance := ROUND(v_new_user_ngn_balance, 2);

  -- MANDATORY SAFETY GUARD: Check system liquidity
  IF v_system_wallet.ngn_float_balance < v_ngn_to_credit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      format('System liquidity low. Available: ₦%s, Required: ₦%s', 
        v_system_wallet.ngn_float_balance, v_ngn_to_credit)::TEXT;
    RETURN;
  END IF;

  -- MANDATORY ATOMIC TRANSACTION: All operations in single transaction
  -- If any step fails, entire operation rolls back
  BEGIN
    -- LOGGING: Log before committing (for debugging)
    RAISE NOTICE 'SELL TRANSACTION START (v1): crypto_amount_sold=%, sell_price=%, calculated_ngn_amount=%, user_crypto_balance_before=%',
      v_crypto_amount_sold, p_price_per_unit, v_ngn_to_credit, v_user_crypto_balance;

    -- 1. Update user_wallets table - debit EXACTLY v_crypto_amount_sold, credit EXACTLY v_ngn_to_credit
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
    -- Update crypto balance - debit EXACTLY v_crypto_amount_sold
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

    -- Update NGN balance - credit EXACTLY v_ngn_to_credit (use SAME value as user_wallets)
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

    -- 4. Update system wallet: add EXACTLY v_crypto_amount_sold to inventory, debit EXACTLY v_ngn_to_credit
    -- CRITICAL: Use correct table name system_wallets (plural) and id = 1 (INTEGER, not UUID)
    UPDATE public.system_wallets
    SET
      btc_inventory = CASE 
        WHEN p_crypto_currency = 'BTC' THEN btc_inventory + v_crypto_amount_sold 
        ELSE btc_inventory 
      END,
      eth_inventory = CASE 
        WHEN p_crypto_currency = 'ETH' THEN eth_inventory + v_crypto_amount_sold 
        ELSE eth_inventory 
      END,
      usdt_inventory = CASE 
        WHEN p_crypto_currency = 'USDT' THEN usdt_inventory + v_crypto_amount_sold 
        ELSE usdt_inventory 
      END,
      usdc_inventory = CASE 
        WHEN p_crypto_currency = 'USDC' THEN usdc_inventory + v_crypto_amount_sold 
        ELSE usdc_inventory 
      END,
      xrp_inventory = CASE 
        WHEN p_crypto_currency = 'XRP' THEN xrp_inventory + v_crypto_amount_sold 
        ELSE xrp_inventory 
      END,
      sol_inventory = CASE 
        WHEN p_crypto_currency = 'SOL' THEN sol_inventory + v_crypto_amount_sold 
        ELSE sol_inventory 
      END,
      ngn_float_balance = ngn_float_balance - v_ngn_to_credit,
      updated_at = NOW()
    WHERE id = 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'System wallet not found';
    END IF;

    -- LOGGING: Log after committing (for debugging)
    RAISE NOTICE 'SELL TRANSACTION SUCCESS (v1): crypto_amount_sold=%, sell_price=%, ngn_credited=%, user_ngn_balance_after=%',
      v_crypto_amount_sold, p_price_per_unit, v_ngn_to_credit, v_new_user_ngn_balance;

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
    -- LOGGING: Log error
    RAISE NOTICE 'SELL TRANSACTION FAILED (v1): error=%, crypto_amount_sold=%, sell_price=%', SQLERRM, v_crypto_amount_sold, p_price_per_unit;
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
COMMENT ON FUNCTION public.instant_sell_crypto IS 'Instant sell crypto function (v1). CRITICAL FIX v4: Enforces EXACT formula NGN_AMOUNT = CRYPTO_AMOUNT_SOLD × SELL_PRICE. Uses SAME crypto_amount_sold for debiting crypto and crediting NGN. All operations in single atomic transaction. Uses SELECT FOR UPDATE to lock rows. Uses user_wallets.ngn_balance as PRIMARY source of truth. Includes validation guards and logging.';
