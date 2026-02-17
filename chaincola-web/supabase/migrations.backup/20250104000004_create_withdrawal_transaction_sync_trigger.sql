-- Create database trigger to automatically update transaction status when withdrawal status changes
-- This ensures transaction status stays in sync with withdrawal status

CREATE OR REPLACE FUNCTION public.sync_withdrawal_transaction_status()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_status TEXT;
BEGIN
  -- Only update if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Map withdrawal status to transaction status
  CASE NEW.status
    WHEN 'completed' THEN
      v_transaction_status := 'COMPLETED';
    WHEN 'failed' THEN
      v_transaction_status := 'FAILED';
    WHEN 'cancelled' THEN
      v_transaction_status := 'CANCELLED';
    WHEN 'processing' THEN
      v_transaction_status := 'CONFIRMING';
    ELSE
      v_transaction_status := 'CONFIRMING';
  END CASE;

  -- Update corresponding transaction record
  UPDATE public.transactions
  SET 
    status = v_transaction_status,
    completed_at = CASE 
      WHEN NEW.status = 'completed' THEN COALESCE(NEW.updated_at, NOW())
      ELSE completed_at
    END,
    error_message = CASE 
      WHEN NEW.status = 'failed' THEN COALESCE((NEW.metadata->>'error')::TEXT, 'Withdrawal failed')
      ELSE error_message
    END,
    updated_at = NOW()
  WHERE 
    user_id = NEW.user_id
    AND transaction_type = 'WITHDRAWAL'
    AND metadata->>'withdrawal_id' = NEW.id::TEXT
    AND status != v_transaction_status; -- Only update if status is different

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS sync_withdrawal_transaction_status_trigger ON public.withdrawals;
CREATE TRIGGER sync_withdrawal_transaction_status_trigger
  AFTER UPDATE OF status ON public.withdrawals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_withdrawal_transaction_status();

-- Add comment
COMMENT ON FUNCTION public.sync_withdrawal_transaction_status IS 'Automatically updates transaction status when withdrawal status changes';









