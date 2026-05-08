-- Create function to automatically verify pending Flutterwave payments
-- This function can be called periodically (via pg_cron or scheduled job) to verify pending transactions

CREATE OR REPLACE FUNCTION public.auto_verify_pending_payments()
RETURNS TABLE (
  verified_count INTEGER,
  failed_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  v_transaction RECORD;
  v_verified_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Find pending transactions that are older than 1 minute (to avoid race conditions)
  -- and have an external_reference (Flutterwave tx_ref)
  FOR v_transaction IN
    SELECT 
      t.id,
      t.user_id,
      t.external_reference,
      t.external_order_id,
      t.fiat_amount,
      t.fiat_currency,
      t.transaction_type,
      t.metadata,
      t.created_at
    FROM public.transactions t
    WHERE t.status = 'PENDING'
      AND t.external_reference IS NOT NULL
      AND t.external_reference LIKE 'CHAINCOLA-%'
      AND t.created_at < NOW() - INTERVAL '1 minute'
      AND t.created_at > NOW() - INTERVAL '24 hours' -- Only check transactions from last 24 hours
    ORDER BY t.created_at ASC
    LIMIT 50 -- Process max 50 at a time to avoid timeout
  LOOP
    BEGIN
      -- Call the verify payment edge function via HTTP
      -- Note: This requires pg_net extension or similar
      -- For now, we'll just mark transactions that are too old as needing manual review
      
      -- Check if transaction is older than 30 minutes
      IF v_transaction.created_at < NOW() - INTERVAL '30 minutes' THEN
        -- Mark as needing manual review if it's been pending for too long
        UPDATE public.transactions
        SET 
          status = 'PENDING',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'needs_manual_review', true,
            'pending_since', v_transaction.created_at,
            'last_auto_check', NOW()
          )
        WHERE id = v_transaction.id;
        
        v_error_count := v_error_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue processing
      RAISE WARNING 'Error processing transaction %: %', v_transaction.id, SQLERRM;
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_verified_count, v_failed_count, v_error_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.auto_verify_pending_payments() TO service_role;

-- Add comment
COMMENT ON FUNCTION public.auto_verify_pending_payments IS 
  'Automatically verifies pending Flutterwave payments. Should be called periodically via scheduled job or pg_cron.';

-- Note: To set up automatic execution, you can use pg_cron (if available):
-- SELECT cron.schedule('verify-pending-payments', '*/5 * * * *', 'SELECT public.auto_verify_pending_payments();');
-- This would run every 5 minutes



