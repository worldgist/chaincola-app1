-- Add Bitcoin deposit detection and crypto balance crediting functions
-- This migration adds functions to credit crypto balances and monitor deposits

-- Function to credit crypto wallet balance (for Bitcoin and other cryptocurrencies)
CREATE OR REPLACE FUNCTION public.credit_crypto_wallet(
  p_user_id UUID,
  p_amount DECIMAL(20, 8),
  p_currency TEXT -- BTC, ETH, etc.
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate currency
  IF p_currency IS NULL OR p_currency = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  -- Update wallet_balances table
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, p_currency, p_amount)
  ON CONFLICT (user_id, currency) DO UPDATE
  SET
    balance = wallet_balances.balance + p_amount,
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to credit crypto wallet: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for pending Bitcoin deposits and update their status
CREATE OR REPLACE FUNCTION public.check_bitcoin_deposit_status(
  p_transaction_id UUID
)
RETURNS TABLE (
  transaction_id UUID,
  status TEXT,
  confirmations INTEGER,
  needs_credit BOOLEAN
) AS $$
DECLARE
  v_tx RECORD;
  v_min_confirmations INTEGER := 6;
BEGIN
  -- Get transaction details
  SELECT * INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
    AND crypto_currency = 'BTC'
    AND transaction_type = 'RECEIVE';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- If already confirmed and credited, return
  IF v_tx.status = 'CONFIRMED' THEN
    RETURN QUERY SELECT v_tx.id, v_tx.status, v_tx.confirmations, false;
    RETURN;
  END IF;

  -- Check if confirmations are sufficient
  IF v_tx.confirmations >= v_min_confirmations AND v_tx.status != 'CONFIRMED' THEN
    -- Update to confirmed
    UPDATE public.transactions
    SET
      status = 'CONFIRMED',
      confirmed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_transaction_id;

    -- Credit the wallet
    PERFORM public.credit_crypto_wallet(
      v_tx.user_id,
      v_tx.crypto_amount,
      'BTC'
    );

    RETURN QUERY SELECT v_tx.id, 'CONFIRMED', v_tx.confirmations, true;
  ELSE
    -- Still pending or confirming
    RETURN QUERY SELECT v_tx.id, v_tx.status, v_tx.confirmations, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get Bitcoin addresses that need monitoring
CREATE OR REPLACE FUNCTION public.get_bitcoin_addresses_to_monitor()
RETURNS TABLE (
  user_id UUID,
  address TEXT,
  last_checked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cw.user_id,
    cw.address,
    MAX(t.updated_at) as last_checked_at
  FROM public.crypto_wallets cw
  LEFT JOIN public.transactions t ON (
    t.to_address = cw.address OR t.from_address = cw.address
  ) AND t.crypto_currency = 'BTC'
  WHERE cw.asset = 'BTC'
    AND cw.network = 'mainnet'
    AND cw.is_active = true
  GROUP BY cw.user_id, cw.address
  ORDER BY last_checked_at NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.credit_crypto_wallet(UUID, DECIMAL, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_bitcoin_deposit_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bitcoin_addresses_to_monitor() TO service_role;

-- Add comments
COMMENT ON FUNCTION public.credit_crypto_wallet IS 
  'Credits a user crypto wallet balance (BTC, ETH, etc.) with the specified amount';
COMMENT ON FUNCTION public.check_bitcoin_deposit_status IS 
  'Checks Bitcoin deposit transaction status and credits wallet if confirmed';
COMMENT ON FUNCTION public.get_bitcoin_addresses_to_monitor IS 
  'Returns all active Bitcoin addresses that should be monitored for deposits';

-- Create index for faster deposit detection queries
CREATE INDEX IF NOT EXISTS idx_transactions_btc_receive_pending 
  ON public.transactions(crypto_currency, transaction_type, status, to_address)
  WHERE crypto_currency = 'BTC' AND transaction_type = 'RECEIVE' AND status IN ('PENDING', 'CONFIRMING');

CREATE INDEX IF NOT EXISTS idx_transactions_btc_hash 
  ON public.transactions(transaction_hash)
  WHERE crypto_currency = 'BTC' AND transaction_hash IS NOT NULL;















