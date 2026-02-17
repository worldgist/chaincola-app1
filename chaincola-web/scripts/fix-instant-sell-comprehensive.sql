-- Comprehensive fix script for instant sell functionality
-- This ensures all components are properly configured

-- ============================================
-- 1. Ensure user_wallets table exists and is properly configured
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ngn_balance DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  btc_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  eth_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdt_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdc_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  xrp_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  sol_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT positive_ngn CHECK (ngn_balance >= 0),
  CONSTRAINT positive_btc CHECK (btc_balance >= 0),
  CONSTRAINT positive_eth CHECK (eth_balance >= 0),
  CONSTRAINT positive_usdt CHECK (usdt_balance >= 0),
  CONSTRAINT positive_usdc CHECK (usdc_balance >= 0),
  CONSTRAINT positive_xrp CHECK (xrp_balance >= 0),
  CONSTRAINT positive_sol CHECK (sol_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON public.user_wallets(user_id);
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Ensure system_wallets table exists
-- ============================================
CREATE TABLE IF NOT EXISTS public.system_wallets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ngn_float_balance DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  btc_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  eth_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdt_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdc_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  xrp_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  sol_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  btc_main_address TEXT,
  eth_main_address TEXT,
  sol_main_address TEXT,
  xrp_main_address TEXT,
  usdt_eth_main_address TEXT,
  usdt_tron_main_address TEXT,
  usdc_eth_main_address TEXT,
  usdc_sol_main_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO public.system_wallets (id, ngn_float_balance)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. Recreate instant_sell_crypto_v2 function with proper minimum reserve check
-- ============================================
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
  v_new_user_ngn_balance DECIMAL(20, 2);
  v_new_user_asset_balance DECIMAL(20, 8);
  v_new_system_asset_inventory DECIMAL(20, 8);
  v_new_system_ngn_balance DECIMAL(20, 2);
  v_transaction_id UUID;
  v_reference TEXT;
BEGIN
  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL') THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, format('Unsupported asset: %s', p_asset)::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Check max sell per transaction
  IF p_max_sell_per_transaction IS NOT NULL AND p_amount > p_max_sell_per_transaction THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Amount exceeds maximum sell per transaction: %s', p_max_sell_per_transaction)::TEXT;
    RETURN;
  END IF;

  -- Load user wallet
  SELECT * INTO v_user_wallet FROM public.user_wallets WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id) VALUES (p_user_id) RETURNING * INTO v_user_wallet;
  END IF;

  -- Load system wallet
  SELECT * INTO v_system_wallet FROM public.system_wallets WHERE id = 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, 'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get user asset balance
  CASE p_asset
    WHEN 'BTC' THEN v_user_asset_balance := v_user_wallet.btc_balance;
    WHEN 'ETH' THEN v_user_asset_balance := v_user_wallet.eth_balance;
    WHEN 'USDT' THEN v_user_asset_balance := v_user_wallet.usdt_balance;
    WHEN 'USDC' THEN v_user_asset_balance := v_user_wallet.usdc_balance;
    WHEN 'XRP' THEN v_user_asset_balance := v_user_wallet.xrp_balance;
    WHEN 'SOL' THEN v_user_asset_balance := v_user_wallet.sol_balance;
  END CASE;

  -- Validate user has enough balance
  IF v_user_asset_balance < p_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('Insufficient balance. Current: %s %s, Requested: %s %s',
        v_user_asset_balance, p_asset, p_amount, p_asset)::TEXT;
    RETURN;
  END IF;

  -- Calculate amounts
  v_total_ngn_before_fee := p_amount * p_rate;
  v_fee := v_total_ngn_before_fee * p_fee_percentage;
  v_ngn_amount := v_total_ngn_before_fee - v_fee;

  -- Check system liquidity
  IF v_system_wallet.ngn_float_balance < v_ngn_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
      format('System liquidity low. Available: ₦%s, Required: ₦%s',
        v_system_wallet.ngn_float_balance, v_ngn_amount)::TEXT;
    RETURN;
  END IF;

  -- Check minimum system reserve (kill switch)
  -- If p_min_system_reserve is 0, skip this check (for testing)
  IF p_min_system_reserve > 0 THEN
    v_new_system_ngn_balance := v_system_wallet.ngn_float_balance - v_ngn_amount;
    IF v_new_system_ngn_balance < p_min_system_reserve THEN
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB,
        format('System reserve below minimum. Cannot process sell. Reserve would be: ₦%s, Minimum: ₦%s',
          v_new_system_ngn_balance, p_min_system_reserve)::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Calculate new balances
  v_new_user_asset_balance := v_user_asset_balance - p_amount;
  v_new_user_ngn_balance := v_user_wallet.ngn_balance + v_ngn_amount;

  -- Get new system asset inventory
  CASE p_asset
    WHEN 'BTC' THEN v_new_system_asset_inventory := v_system_wallet.btc_inventory + p_amount;
    WHEN 'ETH' THEN v_new_system_asset_inventory := v_system_wallet.eth_inventory + p_amount;
    WHEN 'USDT' THEN v_new_system_asset_inventory := v_system_wallet.usdt_inventory + p_amount;
    WHEN 'USDC' THEN v_new_system_asset_inventory := v_system_wallet.usdc_inventory + p_amount;
    WHEN 'XRP' THEN v_new_system_asset_inventory := v_system_wallet.xrp_inventory + p_amount;
    WHEN 'SOL' THEN v_new_system_asset_inventory := v_system_wallet.sol_inventory + p_amount;
  END CASE;

  -- Generate reference
  v_reference := 'SELL_' || UPPER(p_asset) || '_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '_' || SUBSTRING(p_user_id::TEXT, 1, 8);

  -- Execute atomic transaction
  BEGIN
    -- Update user wallet
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
      RAISE EXCEPTION 'Failed to update user wallet';
    END IF;

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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update system wallet';
    END IF;

    -- Insert transaction record
    INSERT INTO public.transactions (
      user_id, transaction_type, crypto_currency, crypto_amount,
      fiat_currency, fiat_amount, status, external_reference, completed_at, metadata
    )
    VALUES (
      p_user_id, 'SELL', p_asset, p_amount, 'NGN', v_ngn_amount,
      'COMPLETED', v_reference, NOW(),
      jsonb_build_object(
        'type', 'sell', 'asset', p_asset, 'crypto_amount', p_amount,
        'ngn_amount', v_ngn_amount, 'rate', p_rate, 'fee', v_fee,
        'fee_percentage', p_fee_percentage, 'reference', v_reference, 'instant_sell', true
      )
    )
    RETURNING id INTO v_transaction_id;

    -- Return success
    RETURN QUERY SELECT 
      true, v_ngn_amount,
      jsonb_build_object(
        'ngn_balance', v_new_user_ngn_balance,
        'btc_balance', CASE WHEN p_asset = 'BTC' THEN v_new_user_asset_balance ELSE v_user_wallet.btc_balance END,
        'eth_balance', CASE WHEN p_asset = 'ETH' THEN v_new_user_asset_balance ELSE v_user_wallet.eth_balance END,
        'usdt_balance', CASE WHEN p_asset = 'USDT' THEN v_new_user_asset_balance ELSE v_user_wallet.usdt_balance END,
        'usdc_balance', CASE WHEN p_asset = 'USDC' THEN v_new_user_asset_balance ELSE v_user_wallet.usdc_balance END,
        'xrp_balance', CASE WHEN p_asset = 'XRP' THEN v_new_user_asset_balance ELSE v_user_wallet.xrp_balance END,
        'sol_balance', CASE WHEN p_asset = 'SOL' THEN v_new_user_asset_balance ELSE v_user_wallet.sol_balance END
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::JSONB, SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.instant_sell_crypto_v2(UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL) TO authenticated, service_role;

COMMENT ON FUNCTION public.instant_sell_crypto_v2 IS 'Atomically swaps crypto to NGN instantly. Updates user_wallets and system_wallets, inserts transaction record. All in one transaction. Minimum reserve check is configurable via p_min_system_reserve parameter (0 = disabled for testing).';

-- ============================================
-- 4. Sync balances from wallet_balances to user_wallets
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_user_wallet_from_balances(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ngn_balance DECIMAL(20, 2) := 0;
  v_btc_balance DECIMAL(20, 8) := 0;
  v_eth_balance DECIMAL(20, 8) := 0;
  v_usdt_balance DECIMAL(20, 8) := 0;
  v_usdc_balance DECIMAL(20, 8) := 0;
  v_xrp_balance DECIMAL(20, 8) := 0;
  v_sol_balance DECIMAL(20, 8) := 0;
BEGIN
  -- Get balances from wallet_balances table
  SELECT COALESCE(MAX(CASE WHEN currency = 'NGN' THEN balance END), 0) INTO v_ngn_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'BTC' THEN balance END), 0) INTO v_btc_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'ETH' THEN balance END), 0) INTO v_eth_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'USDT' THEN balance END), 0) INTO v_usdt_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'USDC' THEN balance END), 0) INTO v_usdc_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'XRP' THEN balance END), 0) INTO v_xrp_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(CASE WHEN currency = 'SOL' THEN balance END), 0) INTO v_sol_balance
  FROM public.wallet_balances WHERE user_id = p_user_id;

  -- Insert or update user_wallets (use GREATEST to preserve maximum balance)
  INSERT INTO public.user_wallets (
    user_id, ngn_balance, btc_balance, eth_balance,
    usdt_balance, usdc_balance, xrp_balance, sol_balance
  )
  VALUES (
    p_user_id, v_ngn_balance, v_btc_balance, v_eth_balance,
    v_usdt_balance, v_usdc_balance, v_xrp_balance, v_sol_balance
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    ngn_balance = GREATEST(user_wallets.ngn_balance, v_ngn_balance),
    btc_balance = GREATEST(user_wallets.btc_balance, v_btc_balance),
    eth_balance = GREATEST(user_wallets.eth_balance, v_eth_balance),
    usdt_balance = GREATEST(user_wallets.usdt_balance, v_usdt_balance),
    usdc_balance = GREATEST(user_wallets.usdc_balance, v_usdc_balance),
    xrp_balance = GREATEST(user_wallets.xrp_balance, v_xrp_balance),
    sol_balance = GREATEST(user_wallets.sol_balance, v_sol_balance),
    updated_at = NOW();
END;
$$;

-- Sync all existing users
DO $$
DECLARE
  v_user_id UUID;
  v_synced_count INTEGER := 0;
BEGIN
  FOR v_user_id IN SELECT DISTINCT user_id FROM public.wallet_balances
  LOOP
    PERFORM public.sync_user_wallet_from_balances(v_user_id);
    v_synced_count := v_synced_count + 1;
  END LOOP;
  RAISE NOTICE 'Synced % users from wallet_balances to user_wallets', v_synced_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_wallet_from_balances(UUID) TO service_role, authenticated;

-- ============================================
-- Summary
-- ============================================
-- This script:
-- 1. Ensures user_wallets and system_wallets tables exist
-- 2. Recreates instant_sell_crypto_v2 function with proper minimum reserve logic
-- 3. Syncs all balances from wallet_balances to user_wallets
-- 4. Grants proper permissions
