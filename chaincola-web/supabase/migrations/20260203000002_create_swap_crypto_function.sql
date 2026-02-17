-- Create swap_crypto function
-- Swaps one cryptocurrency for another in a single atomic transaction
-- Logic: Sell Crypto A at sell price → Buy Crypto B at buy price
-- Treasury effect: System inventory of Asset A increases, Asset B decreases

DROP FUNCTION IF EXISTS public.swap_crypto(UUID, TEXT, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL);

CREATE OR REPLACE FUNCTION public.swap_crypto(
  p_user_id UUID,
  p_from_asset TEXT, -- Asset to swap FROM (e.g., 'SOL')
  p_to_asset TEXT, -- Asset to swap TO (e.g., 'USDT')
  p_from_amount DECIMAL(20, 8), -- Amount of from_asset to swap
  p_from_sell_price DECIMAL(20, 2), -- Sell price of from_asset in NGN
  p_to_buy_price DECIMAL(20, 2), -- Buy price of to_asset in NGN
  p_swap_fee_percentage DECIMAL(5, 4) DEFAULT 0.005, -- Optional swap fee (0.5% default)
  p_min_system_reserve DECIMAL(20, 2) DEFAULT 1000000.00 -- Minimum system NGN reserve
)
RETURNS TABLE(
  success BOOLEAN,
  from_amount DECIMAL(20, 8),
  to_amount DECIMAL(20, 8),
  value_in_ngn DECIMAL(20, 2),
  swap_fee DECIMAL(20, 2),
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
  v_value_in_ngn DECIMAL(20, 2);
  v_swap_fee DECIMAL(20, 2);
  v_value_after_fee DECIMAL(20, 2);
  v_to_amount DECIMAL(20, 8);
  
  -- Current balances
  v_current_from_balance DECIMAL(20, 8);
  v_current_to_balance DECIMAL(20, 8);
  v_current_system_from_inventory DECIMAL(20, 8);
  v_current_system_to_inventory DECIMAL(20, 8);
  
  -- New balances
  v_new_from_balance DECIMAL(20, 8);
  v_new_to_balance DECIMAL(20, 8);
  v_new_system_from_inventory DECIMAL(20, 8);
  v_new_system_to_inventory DECIMAL(20, 8);
  
  v_transaction_id UUID;
  v_reference TEXT;
BEGIN
  -- Validate inputs
  IF p_from_asset IS NULL OR p_from_asset = '' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'From asset is required'::TEXT;
    RETURN;
  END IF;

  IF p_to_asset IS NULL OR p_to_asset = '' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'To asset is required'::TEXT;
    RETURN;
  END IF;

  IF p_from_asset = p_to_asset THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'Cannot swap the same asset'::TEXT;
    RETURN;
  END IF;

  IF p_from_amount IS NULL OR p_from_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'From amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_from_sell_price IS NULL OR p_from_sell_price <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'Invalid sell price for from asset'::TEXT;
    RETURN;
  END IF;

  IF p_to_buy_price IS NULL OR p_to_buy_price <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'Invalid buy price for to asset'::TEXT;
    RETURN;
  END IF;

  -- Get user wallet
  SELECT * INTO v_user_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'User wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get system wallet
  SELECT * INTO v_system_wallet
  FROM public.system_wallets
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      'System wallet not found'::TEXT;
    RETURN;
  END IF;

  -- Get current user balances for from_asset
  CASE UPPER(p_from_asset)
    WHEN 'BTC' THEN v_current_from_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_from_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_from_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_from_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_from_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_from_balance := COALESCE(v_user_wallet.sol_balance, 0);
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
        format('Unsupported from asset: %s', p_from_asset)::TEXT;
      RETURN;
  END CASE;

  -- Get current user balances for to_asset
  CASE UPPER(p_to_asset)
    WHEN 'BTC' THEN v_current_to_balance := COALESCE(v_user_wallet.btc_balance, 0);
    WHEN 'ETH' THEN v_current_to_balance := COALESCE(v_user_wallet.eth_balance, 0);
    WHEN 'USDT' THEN v_current_to_balance := COALESCE(v_user_wallet.usdt_balance, 0);
    WHEN 'USDC' THEN v_current_to_balance := COALESCE(v_user_wallet.usdc_balance, 0);
    WHEN 'XRP' THEN v_current_to_balance := COALESCE(v_user_wallet.xrp_balance, 0);
    WHEN 'SOL' THEN v_current_to_balance := COALESCE(v_user_wallet.sol_balance, 0);
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
        format('Unsupported to asset: %s', p_to_asset)::TEXT;
      RETURN;
  END CASE;

  -- Check user has sufficient from_asset balance
  IF v_current_from_balance < p_from_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      format('Insufficient %s balance. Current: %s, Required: %s', 
        p_from_asset, v_current_from_balance, p_from_amount)::TEXT;
    RETURN;
  END IF;

  -- Get current system inventory
  CASE UPPER(p_from_asset)
    WHEN 'BTC' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.btc_inventory, 0);
    WHEN 'ETH' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.eth_inventory, 0);
    WHEN 'USDT' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.usdt_inventory, 0);
    WHEN 'USDC' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.usdc_inventory, 0);
    WHEN 'XRP' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.xrp_inventory, 0);
    WHEN 'SOL' THEN v_current_system_from_inventory := COALESCE(v_system_wallet.sol_inventory, 0);
  END CASE;

  CASE UPPER(p_to_asset)
    WHEN 'BTC' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.btc_inventory, 0);
    WHEN 'ETH' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.eth_inventory, 0);
    WHEN 'USDT' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.usdt_inventory, 0);
    WHEN 'USDC' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.usdc_inventory, 0);
    WHEN 'XRP' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.xrp_inventory, 0);
    WHEN 'SOL' THEN v_current_system_to_inventory := COALESCE(v_system_wallet.sol_inventory, 0);
  END CASE;

  -- Calculate swap: value_in_ngn = amount_A × sell_price_A
  v_value_in_ngn := ROUND(p_from_amount * p_from_sell_price, 2);

  -- Apply swap fee
  v_swap_fee := ROUND(v_value_in_ngn * p_swap_fee_percentage, 2);
  v_value_after_fee := v_value_in_ngn - v_swap_fee;

  -- Calculate to_amount: amount_B = value_in_ngn ÷ buy_price_B
  v_to_amount := ROUND((v_value_after_fee / p_to_buy_price)::DECIMAL, 8);

  -- Check system has sufficient to_asset inventory
  IF v_current_system_to_inventory < v_to_amount THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, NULL::JSONB,
      format('Insufficient system inventory for %s. Available: %s, Required: %s',
        p_to_asset, v_current_system_to_inventory, v_to_amount)::TEXT;
    RETURN;
  END IF;

  -- Calculate new balances
  -- User: debit from_asset, credit to_asset
  v_new_from_balance := ROUND(v_current_from_balance - p_from_amount, 8);
  v_new_to_balance := ROUND(v_current_to_balance + v_to_amount, 8);

  -- System: credit from_asset, debit to_asset
  v_new_system_from_inventory := ROUND(v_current_system_from_inventory + p_from_amount, 8);
  v_new_system_to_inventory := ROUND(v_current_system_to_inventory - v_to_amount, 8);

  -- Generate transaction reference
  v_transaction_id := gen_random_uuid();
  v_reference := format('SWAP_%s_%s_%s', p_from_asset, p_to_asset, 
    TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'));

  -- Perform atomic swap transaction
  BEGIN
    -- 1. Update user_wallets: debit from_asset, credit to_asset
    UPDATE public.user_wallets
    SET
      btc_balance = CASE 
        WHEN UPPER(p_from_asset) = 'BTC' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'BTC' THEN v_new_to_balance
        ELSE btc_balance
      END,
      eth_balance = CASE 
        WHEN UPPER(p_from_asset) = 'ETH' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'ETH' THEN v_new_to_balance
        ELSE eth_balance
      END,
      usdt_balance = CASE 
        WHEN UPPER(p_from_asset) = 'USDT' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'USDT' THEN v_new_to_balance
        ELSE usdt_balance
      END,
      usdc_balance = CASE 
        WHEN UPPER(p_from_asset) = 'USDC' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'USDC' THEN v_new_to_balance
        ELSE usdc_balance
      END,
      xrp_balance = CASE 
        WHEN UPPER(p_from_asset) = 'XRP' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'XRP' THEN v_new_to_balance
        ELSE xrp_balance
      END,
      sol_balance = CASE 
        WHEN UPPER(p_from_asset) = 'SOL' THEN v_new_from_balance
        WHEN UPPER(p_to_asset) = 'SOL' THEN v_new_to_balance
        ELSE sol_balance
      END,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update user_wallets';
    END IF;

    -- 2. Update wallet_balances for from_asset (debit)
    UPDATE public.wallet_balances
    SET
      balance = v_new_from_balance,
      updated_at = NOW()
    WHERE user_id = p_user_id
      AND currency = UPPER(p_from_asset);

    -- 3. Update wallet_balances for to_asset (credit)
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, UPPER(p_to_asset), v_new_to_balance, NOW())
    ON CONFLICT (user_id, currency) 
    DO UPDATE SET
      balance = v_new_to_balance,
      updated_at = NOW();

    -- 4. Update system_wallets: credit from_asset, debit to_asset
    UPDATE public.system_wallets
    SET
      btc_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'BTC' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'BTC' THEN v_new_system_to_inventory
        ELSE btc_inventory
      END,
      eth_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'ETH' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'ETH' THEN v_new_system_to_inventory
        ELSE eth_inventory
      END,
      usdt_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'USDT' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'USDT' THEN v_new_system_to_inventory
        ELSE usdt_inventory
      END,
      usdc_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'USDC' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'USDC' THEN v_new_system_to_inventory
        ELSE usdc_inventory
      END,
      xrp_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'XRP' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'XRP' THEN v_new_system_to_inventory
        ELSE xrp_inventory
      END,
      sol_inventory = CASE 
        WHEN UPPER(p_from_asset) = 'SOL' THEN v_new_system_from_inventory
        WHEN UPPER(p_to_asset) = 'SOL' THEN v_new_system_to_inventory
        ELSE sol_inventory
      END,
      updated_at = NOW()
    WHERE id = v_system_wallet.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update system_wallets';
    END IF;

    -- 5. Create transaction record
    INSERT INTO public.transactions (
      id,
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
      notes,
      completed_at,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      v_transaction_id,
      p_user_id,
      'SWAP',
      UPPER(p_from_asset),
      p_from_amount,
      v_value_in_ngn,
      'NGN',
      v_swap_fee,
      p_swap_fee_percentage * 100,
      'NGN',
      'COMPLETED',
      v_reference,
      format('Swapped %s %s for %s %s', p_from_amount, p_from_asset, v_to_amount, p_to_asset),
      NOW(),
      jsonb_build_object(
        'from_asset', p_from_asset,
        'to_asset', p_to_asset,
        'from_amount', p_from_amount,
        'to_amount', v_to_amount,
        'from_sell_price', p_from_sell_price,
        'to_buy_price', p_to_buy_price,
        'value_in_ngn', v_value_in_ngn,
        'swap_fee', v_swap_fee,
        'swap_fee_percentage', p_swap_fee_percentage,
        'operation', 'SWAP',
        'source', 'swap_crypto_function'
      ),
      NOW(),
      NOW()
    );

    -- 6. Log swap to treasury audit logs
    INSERT INTO public.audit_logs (
      action_type,
      performed_by,
      target_user_id,
      target_entity_type,
      target_entity_id,
      description,
      old_value,
      new_value,
      changes,
      regulatory_category,
      requires_retention,
      metadata
    ) VALUES (
      'CRYPTO_SWAP',
      p_user_id,
      p_user_id,
      'SYSTEM_WALLET',
      NULL,
      format('Crypto swap: %s %s → %s %s (User: %s)', 
        p_from_amount, UPPER(p_from_asset), v_to_amount, UPPER(p_to_asset), p_user_id),
      jsonb_build_object(
        'system_from_inventory', v_current_system_from_inventory,
        'system_to_inventory', v_current_system_to_inventory,
        'user_from_balance', v_current_from_balance,
        'user_to_balance', v_current_to_balance
      ),
      jsonb_build_object(
        'system_from_inventory', v_new_system_from_inventory,
        'system_to_inventory', v_new_system_to_inventory,
        'user_from_balance', v_new_from_balance,
        'user_to_balance', v_new_to_balance
      ),
      jsonb_build_object(
        UPPER(p_from_asset) || '_inventory', jsonb_build_object(
          'old', v_current_system_from_inventory,
          'new', v_new_system_from_inventory,
          'delta', p_from_amount
        ),
        UPPER(p_to_asset) || '_inventory', jsonb_build_object(
          'old', v_current_system_to_inventory,
          'new', v_new_system_to_inventory,
          'delta', -v_to_amount
        )
      ),
      'FINANCIAL',
      true,
      jsonb_build_object(
        'transaction_id', v_transaction_id,
        'reference', v_reference,
        'from_asset', UPPER(p_from_asset),
        'to_asset', UPPER(p_to_asset),
        'from_amount', p_from_amount,
        'to_amount', v_to_amount,
        'from_sell_price', p_from_sell_price,
        'to_buy_price', p_to_buy_price,
        'value_in_ngn', v_value_in_ngn,
        'swap_fee', v_swap_fee,
        'swap_fee_percentage', p_swap_fee_percentage,
        'operation', 'SWAP',
        'source', 'swap_crypto_function'
      )
    );

    -- Return success with new balances
    RETURN QUERY SELECT 
      true,
      p_from_amount,
      v_to_amount,
      v_value_in_ngn,
      v_swap_fee,
      jsonb_build_object(
        'from_asset', p_from_asset,
        'to_asset', p_to_asset,
        'from_balance', v_new_from_balance,
        'to_balance', v_new_to_balance,
        'system_from_inventory', v_new_system_from_inventory,
        'system_to_inventory', v_new_system_to_inventory
      ),
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false, 
      0::DECIMAL, 
      0::DECIMAL, 
      0::DECIMAL, 
      0::DECIMAL, 
      NULL::JSONB,
      format('Swap failed: %s', SQLERRM)::TEXT;
  END;
END;
$$;

COMMENT ON FUNCTION public.swap_crypto IS 'Swap one cryptocurrency for another in a single atomic transaction. Uses sell price for from_asset and buy price for to_asset.';
