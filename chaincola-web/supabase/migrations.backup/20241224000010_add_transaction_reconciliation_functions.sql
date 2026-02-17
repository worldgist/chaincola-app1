-- Add functions to help reconcile pending transactions
-- These functions help identify and fix transactions that are pending but should be completed

-- Function to get pending transactions that might need reconciliation
-- This helps identify transactions that have been pending for a while
CREATE OR REPLACE FUNCTION public.get_pending_transactions_for_reconciliation(
  p_hours_old INTEGER DEFAULT 1 -- Transactions older than this many hours
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  transaction_type TEXT,
  fiat_amount DECIMAL,
  fiat_currency TEXT,
  external_reference TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.transaction_type,
    t.fiat_amount,
    t.fiat_currency,
    t.external_reference,
    t.status,
    t.created_at
  FROM public.transactions t
  WHERE t.status = 'PENDING'
    AND t.transaction_type = 'DEPOSIT'
    AND t.external_reference IS NOT NULL
    AND t.created_at < NOW() - (p_hours_old || ' hours')::INTERVAL
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually mark a transaction as completed (admin only)
-- Use this when you've verified the payment was successful but transaction wasn't updated
CREATE OR REPLACE FUNCTION public.manual_complete_transaction(
  p_transaction_id UUID,
  p_admin_user_id UUID,
  p_external_transaction_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_transaction RECORD;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can manually complete transactions';
  END IF;
  
  -- Get transaction details
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  
  -- Only allow completing PENDING transactions
  IF v_transaction.status != 'PENDING' THEN
    RAISE EXCEPTION 'Transaction is not pending. Current status: %', v_transaction.status;
  END IF;
  
  -- Update transaction status
  UPDATE public.transactions
  SET status = 'COMPLETED',
      external_transaction_id = COALESCE(p_external_transaction_id, external_transaction_id),
      updated_at = NOW(),
      completed_at = NOW()
  WHERE id = p_transaction_id;
  
  -- If it's a DEPOSIT transaction, credit the wallet (with 5% fee deduction)
  IF v_transaction.transaction_type = 'DEPOSIT' AND v_transaction.fiat_amount IS NOT NULL THEN
    DECLARE
      v_amount DECIMAL;
      v_currency TEXT;
      v_deposit_fee_rate DECIMAL := 0.05; -- 5% deposit fee
      v_deposit_fee DECIMAL;
      v_net_amount DECIMAL;
    BEGIN
      v_amount := v_transaction.fiat_amount;
      v_currency := COALESCE(v_transaction.fiat_currency, 'NGN');
      
      -- Calculate deposit fee and net amount
      v_deposit_fee := v_amount * v_deposit_fee_rate;
      v_net_amount := v_amount - v_deposit_fee;
      
      -- Update transaction metadata with fee information
      UPDATE public.transactions
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'deposit_fee', v_deposit_fee,
        'deposit_fee_rate', v_deposit_fee_rate,
        'gross_amount', v_amount,
        'net_amount', v_net_amount,
        'manually_completed', true,
        'completed_by_admin', p_admin_user_id
      )
      WHERE id = p_transaction_id;
      
      -- Credit user wallet with net amount (after fee deduction)
      PERFORM public.credit_wallet(
        v_transaction.user_id,
        v_net_amount,
        v_currency
      );
    END;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get transaction statistics by status
CREATE OR REPLACE FUNCTION public.get_transaction_status_stats(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  count BIGINT,
  total_amount DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.status,
    COUNT(*)::BIGINT as count,
    COALESCE(SUM(t.fiat_amount), 0) as total_amount
  FROM public.transactions t
  WHERE (p_user_id IS NULL OR t.user_id = p_user_id)
    AND t.transaction_type = 'DEPOSIT'
  GROUP BY t.status
  ORDER BY 
    CASE t.status
      WHEN 'PENDING' THEN 1
      WHEN 'COMPLETED' THEN 2
      WHEN 'FAILED' THEN 3
      WHEN 'CANCELLED' THEN 4
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a transaction's payment was successful (for reconciliation)
-- This queries Flutterwave API to verify payment status
-- Note: This requires the Flutterwave API to be called from an Edge Function
-- This function just provides the transaction details needed for verification
CREATE OR REPLACE FUNCTION public.get_transaction_for_verification(
  p_external_reference TEXT
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  transaction_type TEXT,
  fiat_amount DECIMAL,
  fiat_currency TEXT,
  status TEXT,
  external_reference TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.transaction_type,
    t.fiat_amount,
    t.fiat_currency,
    t.status,
    t.external_reference,
    t.created_at
  FROM public.transactions t
  WHERE t.external_reference = p_external_reference
  ORDER BY t.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_pending_transactions_for_reconciliation(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_complete_transaction(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_status_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_for_verification(TEXT) TO authenticated, service_role;

-- Add comments
COMMENT ON FUNCTION public.get_pending_transactions_for_reconciliation IS 'Get pending transactions that might need reconciliation (for admin review)';
COMMENT ON FUNCTION public.manual_complete_transaction IS 'Manually mark a transaction as completed and credit wallet (admin only - use when payment was successful but transaction not updated)';
COMMENT ON FUNCTION public.get_transaction_status_stats IS 'Get statistics about transaction statuses';
COMMENT ON FUNCTION public.get_transaction_for_verification IS 'Get transaction details for verification by external reference';

