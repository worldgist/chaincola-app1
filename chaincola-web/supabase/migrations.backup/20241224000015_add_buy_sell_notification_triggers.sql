-- Add notification triggers for buy and sell transactions
-- Creates notifications when transactions are completed or failed

-- Function to create notification for buy transaction completion
CREATE OR REPLACE FUNCTION public.notify_buy_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create notification when status changes to COMPLETED or FAILED
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
    -- Create success notification
    PERFORM public.create_notification(
      NEW.user_id,
      'transaction',
      CASE 
        WHEN NEW.crypto_amount IS NOT NULL THEN
          format('Buy %s Completed', NEW.crypto_currency)
        ELSE
          format('Buy %s Order Completed', NEW.crypto_currency)
      END,
      CASE 
        WHEN NEW.crypto_amount IS NOT NULL THEN
          format('Your buy order for %s has been completed successfully. You received %s %s. Order ID: %s', 
            NEW.crypto_currency,
            NEW.crypto_amount::TEXT,
            NEW.crypto_currency,
            COALESCE(NEW.luno_order_id, 'N/A'))
        ELSE
          format('Your buy order for %s has been completed successfully. Order ID: %s', 
            NEW.crypto_currency,
            COALESCE(NEW.luno_order_id, 'N/A'))
      END,
      jsonb_build_object(
        'transaction_id', NEW.id,
        'transaction_type', 'buy',
        'crypto_currency', NEW.crypto_currency,
        'ngn_amount', NEW.ngn_amount,
        'crypto_amount', NEW.crypto_amount,
        'fee_amount', NEW.fee_amount,
        'luno_order_id', NEW.luno_order_id,
        'status', NEW.status
      )
    );
  ELSIF NEW.status = 'FAILED' AND (OLD.status IS NULL OR OLD.status != 'FAILED') THEN
    -- Create failure notification (if not already created by edge function)
    PERFORM public.create_notification(
      NEW.user_id,
      'transaction',
      format('Buy %s Order Failed', NEW.crypto_currency),
      format('Your buy order for %s could not be completed. %s', 
        NEW.crypto_currency,
        COALESCE(NEW.error_message, 'Please try again or contact support.')),
      jsonb_build_object(
        'transaction_id', NEW.id,
        'transaction_type', 'buy',
        'crypto_currency', NEW.crypto_currency,
        'status', NEW.status,
        'error_message', NEW.error_message
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for sell transaction completion
CREATE OR REPLACE FUNCTION public.notify_sell_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create notification when status changes to COMPLETED or FAILED
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
    -- Create success notification
    PERFORM public.create_notification(
      NEW.user_id,
      'transaction',
      CASE 
        WHEN NEW.ngn_amount IS NOT NULL THEN
          format('Sell %s Completed', NEW.crypto_currency)
        ELSE
          format('Sell %s Order Completed', NEW.crypto_currency)
      END,
      CASE 
        WHEN NEW.ngn_amount IS NOT NULL AND NEW.fee_amount IS NOT NULL THEN
          format('Your sell order for %s %s has been completed successfully. You received ₦%s (Fee: ₦%s). Order ID: %s', 
            NEW.crypto_amount::TEXT,
            NEW.crypto_currency,
            NEW.ngn_amount::TEXT,
            NEW.fee_amount::TEXT,
            COALESCE(NEW.luno_order_id, 'N/A'))
        WHEN NEW.ngn_amount IS NOT NULL THEN
          format('Your sell order for %s %s has been completed successfully. You received ₦%s. Order ID: %s', 
            NEW.crypto_amount::TEXT,
            NEW.crypto_currency,
            NEW.ngn_amount::TEXT,
            COALESCE(NEW.luno_order_id, 'N/A'))
        ELSE
          format('Your sell order for %s %s has been completed successfully. Order ID: %s', 
            NEW.crypto_amount::TEXT,
            NEW.crypto_currency,
            COALESCE(NEW.luno_order_id, 'N/A'))
      END,
      jsonb_build_object(
        'transaction_id', NEW.id,
        'transaction_type', 'sell',
        'crypto_currency', NEW.crypto_currency,
        'crypto_amount', NEW.crypto_amount,
        'ngn_amount', NEW.ngn_amount,
        'fee_amount', NEW.fee_amount,
        'luno_order_id', NEW.luno_order_id,
        'status', NEW.status
      )
    );
  ELSIF NEW.status = 'FAILED' AND (OLD.status IS NULL OR OLD.status != 'FAILED') THEN
    -- Create failure notification (if not already created by edge function)
    PERFORM public.create_notification(
      NEW.user_id,
      'transaction',
      format('Sell %s Order Failed', NEW.crypto_currency),
      format('Your sell order for %s %s could not be completed. %s', 
        NEW.crypto_amount::TEXT,
        NEW.crypto_currency,
        COALESCE(NEW.error_message, 'Please try again or contact support.')),
      jsonb_build_object(
        'transaction_id', NEW.id,
        'transaction_type', 'sell',
        'crypto_currency', NEW.crypto_currency,
        'crypto_amount', NEW.crypto_amount,
        'status', NEW.status,
        'error_message', NEW.error_message
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for buy transactions
DROP TRIGGER IF EXISTS notify_buy_transaction_completion ON public.buy_transactions;
CREATE TRIGGER notify_buy_transaction_completion
  AFTER UPDATE ON public.buy_transactions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_buy_transaction_status_change();

-- Create triggers for sell transactions
DROP TRIGGER IF EXISTS notify_sell_transaction_completion ON public.sell_transactions;
CREATE TRIGGER notify_sell_transaction_completion
  AFTER UPDATE ON public.sell_transactions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_sell_transaction_status_change();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.notify_buy_transaction_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_sell_transaction_status_change() TO service_role;

-- Add comments
COMMENT ON FUNCTION public.notify_buy_transaction_status_change IS 'Creates notifications when buy transaction status changes to COMPLETED or FAILED';
COMMENT ON FUNCTION public.notify_sell_transaction_status_change IS 'Creates notifications when sell transaction status changes to COMPLETED or FAILED';















