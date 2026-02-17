-- Create admin refund transaction function
-- Allows admins to refund users when transactions fail
-- Handles both crypto and fiat refunds, updates all wallet tables

CREATE OR REPLACE FUNCTION public.admin_refund_transaction(
  p_transaction_id UUID,
  p_admin_user_id UUID,
  p_refund_reason TEXT DEFAULT 'Admin refund for failed transaction'
)
RETURNS TABLE(
  success BOOLEAN,
  refunded_amount DECIMAL(20, 8),
  refunded_currency TEXT,
  new_balance DECIMAL(20, 8),
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_refund_amount DECIMAL(20, 8);
  v_refund_currency TEXT;
  v_user_id UUID;
  v_current_balance DECIMAL(20, 8);
  v_new_balance DECIMAL(20, 8);
  v_refund_transaction_id UUID;
  v_is_crypto BOOLEAN;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL, 
      'Only admins can refund transactions'::TEXT;
    RETURN;
  END IF;

  -- Get transaction details
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL,
      'Transaction not found'::TEXT;
    RETURN;
  END IF;

  v_user_id := v_transaction.user_id;

  -- Check if transaction is already refunded
  IF v_transaction.status = 'REFUNDED' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL,
      'Transaction already refunded'::TEXT;
    RETURN;
  END IF;

  -- Determine refund amount and currency based on transaction type
  -- For BUY/SELL transactions, refund what was debited
  -- For SEND transactions, refund the crypto amount + fees
  -- For DEPOSIT transactions, refund the fiat amount
  
  IF v_transaction.transaction_type IN ('BUY', 'SELL') THEN
    -- For buy/sell: refund the crypto amount if it was debited
    IF v_transaction.crypto_amount IS NOT NULL AND v_transaction.crypto_amount > 0 THEN
      v_refund_amount := v_transaction.crypto_amount;
      v_refund_currency := v_transaction.crypto_currency;
      v_is_crypto := true;
    ELSIF v_transaction.fiat_amount IS NOT NULL AND v_transaction.fiat_amount > 0 THEN
      -- Refund fiat if crypto amount not available
      v_refund_amount := v_transaction.fiat_amount;
      v_refund_currency := v_transaction.fiat_currency;
      v_is_crypto := false;
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL,
        'No amount found to refund'::TEXT;
      RETURN;
    END IF;
  ELSIF v_transaction.transaction_type = 'SEND' THEN
    -- For send: refund crypto amount + fees
    v_refund_amount := COALESCE(v_transaction.crypto_amount, 0);
    IF v_transaction.fee_amount IS NOT NULL AND v_transaction.fee_currency = v_transaction.crypto_currency THEN
      v_refund_amount := v_refund_amount + v_transaction.fee_amount;
    END IF;
    v_refund_currency := v_transaction.crypto_currency;
    v_is_crypto := true;
  ELSIF v_transaction.transaction_type = 'DEPOSIT' THEN
    -- For deposit: refund fiat amount (if deposit failed, user shouldn't have been credited)
    v_refund_amount := COALESCE(v_transaction.fiat_amount, 0);
    v_refund_currency := COALESCE(v_transaction.fiat_currency, 'NGN');
    v_is_crypto := false;
  ELSIF v_transaction.transaction_type = 'WITHDRAWAL' THEN
    -- For withdrawal: refund what was debited (usually fiat)
    v_refund_amount := COALESCE(v_transaction.fiat_amount, v_transaction.crypto_amount, 0);
    v_refund_currency := COALESCE(v_transaction.fiat_currency, v_transaction.crypto_currency, 'NGN');
    v_is_crypto := (v_transaction.crypto_currency IS NOT NULL);
  ELSE
    -- Default: try to refund crypto first, then fiat
    IF v_transaction.crypto_amount IS NOT NULL AND v_transaction.crypto_amount > 0 THEN
      v_refund_amount := v_transaction.crypto_amount;
      v_refund_currency := v_transaction.crypto_currency;
      v_is_crypto := true;
    ELSIF v_transaction.fiat_amount IS NOT NULL AND v_transaction.fiat_amount > 0 THEN
      v_refund_amount := v_transaction.fiat_amount;
      v_refund_currency := v_transaction.fiat_currency;
      v_is_crypto := false;
    ELSE
      RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL,
        'No amount found to refund'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_refund_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, NULL::TEXT, 0::DECIMAL,
      'Refund amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Get current balance
  IF v_is_crypto THEN
    -- For crypto: check wallet_balances and user_wallets
    SELECT COALESCE(MAX(balance), 0) INTO v_current_balance
    FROM public.wallet_balances
    WHERE user_id = v_user_id AND currency = v_refund_currency;
    
    -- Also check user_wallets
    SELECT 
      CASE v_refund_currency
        WHEN 'BTC' THEN COALESCE(btc_balance, 0)
        WHEN 'ETH' THEN COALESCE(eth_balance, 0)
        WHEN 'USDT' THEN COALESCE(usdt_balance, 0)
        WHEN 'USDC' THEN COALESCE(usdc_balance, 0)
        WHEN 'XRP' THEN COALESCE(xrp_balance, 0)
        WHEN 'SOL' THEN COALESCE(sol_balance, 0)
        ELSE 0
      END INTO v_current_balance
    FROM public.user_wallets
    WHERE user_id = v_user_id;
    
    v_current_balance := GREATEST(
      v_current_balance,
      COALESCE((
        SELECT balance FROM public.wallet_balances 
        WHERE user_id = v_user_id AND currency = v_refund_currency
      ), 0)
    );
  ELSE
    -- For fiat: check wallets and wallet_balances
    SELECT COALESCE(
      CASE v_refund_currency
        WHEN 'NGN' THEN ngn_balance
        WHEN 'USD' THEN usd_balance
        ELSE 0
      END, 0
    ) INTO v_current_balance
    FROM public.wallets
    WHERE user_id = v_user_id;
    
    v_current_balance := GREATEST(
      v_current_balance,
      COALESCE((
        SELECT balance FROM public.wallet_balances 
        WHERE user_id = v_user_id AND currency = v_refund_currency
      ), 0)
    );
  END IF;

  v_new_balance := v_current_balance + v_refund_amount;

  -- Execute refund in transaction
  BEGIN
    -- 1. Credit the balance
    IF v_is_crypto THEN
      -- Credit crypto: update wallet_balances
      INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
      VALUES (v_user_id, v_refund_currency, v_new_balance, NOW())
      ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = v_new_balance, updated_at = NOW();

      -- Also update user_wallets (create if doesn't exist)
      INSERT INTO public.user_wallets (user_id)
      VALUES (v_user_id)
      ON CONFLICT (user_id) DO NOTHING;
      
      -- Update the specific balance
      UPDATE public.user_wallets
      SET
        btc_balance = CASE WHEN v_refund_currency = 'BTC' THEN v_new_balance ELSE btc_balance END,
        eth_balance = CASE WHEN v_refund_currency = 'ETH' THEN v_new_balance ELSE eth_balance END,
        usdt_balance = CASE WHEN v_refund_currency = 'USDT' THEN v_new_balance ELSE usdt_balance END,
        usdc_balance = CASE WHEN v_refund_currency = 'USDC' THEN v_new_balance ELSE usdc_balance END,
        xrp_balance = CASE WHEN v_refund_currency = 'XRP' THEN v_new_balance ELSE xrp_balance END,
        sol_balance = CASE WHEN v_refund_currency = 'SOL' THEN v_new_balance ELSE sol_balance END,
        updated_at = NOW()
      WHERE user_id = v_user_id;
    ELSE
      -- Credit fiat: update wallet_balances
      INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
      VALUES (v_user_id, v_refund_currency, v_new_balance, NOW())
      ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = v_new_balance, updated_at = NOW();

      -- Also update wallets table
      INSERT INTO public.wallets (user_id, ngn_balance, usd_balance, updated_at)
      VALUES (
        v_user_id,
        CASE WHEN v_refund_currency = 'NGN' THEN v_new_balance ELSE COALESCE((SELECT ngn_balance FROM public.wallets WHERE user_id = v_user_id), 0) END,
        CASE WHEN v_refund_currency = 'USD' THEN v_new_balance ELSE COALESCE((SELECT usd_balance FROM public.wallets WHERE user_id = v_user_id), 0) END,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        ngn_balance = CASE WHEN v_refund_currency = 'NGN' THEN v_new_balance ELSE wallets.ngn_balance END,
        usd_balance = CASE WHEN v_refund_currency = 'USD' THEN v_new_balance ELSE wallets.usd_balance END,
        updated_at = NOW();
    END IF;

    -- 2. Update original transaction status to REFUNDED
    UPDATE public.transactions
    SET
      status = 'REFUNDED',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'refunded_at', NOW(),
        'refunded_by', p_admin_user_id,
        'refund_reason', p_refund_reason,
        'refund_amount', v_refund_amount,
        'refund_currency', v_refund_currency
      ),
      updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 3. Create refund transaction record
    INSERT INTO public.transactions (
      user_id,
      transaction_type,
      crypto_currency,
      crypto_amount,
      fiat_currency,
      fiat_amount,
      status,
      metadata,
      external_reference
    )
    VALUES (
      v_user_id,
      'REFUND',
      CASE WHEN v_is_crypto THEN v_refund_currency ELSE NULL END,
      CASE WHEN v_is_crypto THEN v_refund_amount ELSE NULL END,
      CASE WHEN NOT v_is_crypto THEN v_refund_currency ELSE NULL END,
      CASE WHEN NOT v_is_crypto THEN v_refund_amount ELSE NULL END,
      'COMPLETED',
      jsonb_build_object(
        'original_transaction_id', p_transaction_id,
        'refund_reason', p_refund_reason,
        'refunded_by', p_admin_user_id,
        'original_transaction_type', v_transaction.transaction_type,
        'original_status', v_transaction.status
      ),
      'REFUND_' || p_transaction_id::TEXT
    )
    RETURNING id INTO v_refund_transaction_id;

    -- 4. Log admin action
    INSERT INTO public.admin_action_logs (
      admin_user_id,
      target_user_id,
      action_type,
      action_details
    )
    VALUES (
      p_admin_user_id,
      v_user_id,
      'refund',
      jsonb_build_object(
        'transaction_id', p_transaction_id,
        'refund_transaction_id', v_refund_transaction_id,
        'refund_amount', v_refund_amount,
        'refund_currency', v_refund_currency,
        'reason', p_refund_reason,
        'original_transaction_type', v_transaction.transaction_type
      )
    );

    -- Return success
    RETURN QUERY SELECT 
      true,
      v_refund_amount,
      v_refund_currency,
      v_new_balance,
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    RETURN QUERY SELECT 
      false,
      0::DECIMAL,
      NULL::TEXT,
      0::DECIMAL,
      SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_refund_transaction(UUID, UUID, TEXT) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.admin_refund_transaction IS 'Admin function to refund a failed transaction. Credits user balance and creates refund transaction record. Updates all wallet tables (user_wallets, wallet_balances, wallets).';
