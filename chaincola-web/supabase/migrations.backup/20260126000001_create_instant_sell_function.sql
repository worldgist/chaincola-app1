-- Create atomic instant sell function with system wallet
-- Swaps crypto to NGN instantly using database transaction
-- Moves crypto to system inventory and debits system NGN float balance
-- No blockchain or exchange API calls - pure internal swap

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
  v_user_ngn_balance DECIMAL(20, 2);
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

  -- Get user crypto balance
  SELECT balance INTO v_user_crypto_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_crypto_currency;

  -- Check if crypto balance exists
  IF v_user_crypto_balance IS NULL THEN
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

  -- Get user NGN balance
  SELECT balance INTO v_user_ngn_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = 'NGN';

  -- If NGN balance doesn't exist, initialize to 0
  IF v_user_ngn_balance IS NULL THEN
    v_user_ngn_balance := 0;
    -- Create NGN balance record if it doesn't exist
    INSERT INTO public.wallet_balances (user_id, currency, balance, created_at, updated_at)
    VALUES (p_user_id, 'NGN', 0, NOW(), NOW())
    ON CONFLICT (user_id, currency) DO NOTHING;
  END IF;

  -- Get system wallet
  SELECT * INTO v_system_wallet
  FROM public.system_wallet
  LIMIT 1;

  -- Calculate amounts
  v_total_ngn_before_fee := p_crypto_amount * p_price_per_unit;
  v_platform_fee := v_total_ngn_before_fee * p_platform_fee_percentage;
  v_ngn_to_credit := v_total_ngn_before_fee - v_platform_fee;
  v_new_user_crypto_balance := v_user_crypto_balance - p_crypto_amount;
  v_new_user_ngn_balance := v_user_ngn_balance + v_ngn_to_credit;

  -- Check system liquidity
  IF v_system_wallet.ngn_float_balance < v_ngn_to_credit THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
      format('System liquidity low. Available: ₦%s, Required: ₦%s', 
        v_system_wallet.ngn_float_balance, v_ngn_to_credit)::TEXT;
    RETURN;
  END IF;

  -- Perform atomic swap: debit user crypto, credit user NGN, update system wallet
  BEGIN
    -- Debit user crypto balance
    UPDATE public.wallet_balances
    SET
      balance = v_new_user_crypto_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_crypto_currency;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to debit crypto balance';
    END IF;

    -- Credit user NGN balance
    UPDATE public.wallet_balances
    SET
      balance = v_new_user_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id AND currency = 'NGN';

    IF NOT FOUND THEN
      -- Create NGN balance if it doesn't exist
      INSERT INTO public.wallet_balances (user_id, currency, balance, created_at, updated_at)
      VALUES (p_user_id, 'NGN', v_ngn_to_credit, NOW(), NOW())
      ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = v_new_user_ngn_balance, updated_at = NOW();
    END IF;

    -- Update system wallet: add crypto to inventory, debit NGN float
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

    -- Also update wallets table for NGN (for backward compatibility)
    UPDATE public.wallets
    SET
      ngn_balance = v_new_user_ngn_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Return success
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
COMMENT ON FUNCTION public.instant_sell_crypto IS 'Atomically swaps crypto to NGN instantly using system wallet. Debits user crypto, credits user NGN, moves crypto to system inventory, and debits system NGN float balance. Checks system liquidity before execution. No blockchain or exchange API calls.';
