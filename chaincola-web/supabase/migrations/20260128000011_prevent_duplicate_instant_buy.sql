-- Prevent duplicate instant buy transactions
-- Add unique constraint on external_reference for BUY transactions to prevent double execution

-- First, check for and remove any duplicate BUY transactions with the same reference
DO $$
DECLARE
  dup_record RECORD;
BEGIN
  FOR dup_record IN
    SELECT external_reference, user_id, crypto_currency, MIN(created_at) as first_created
    FROM public.transactions
    WHERE external_reference IS NOT NULL
      AND transaction_type = 'BUY'
    GROUP BY external_reference, user_id, crypto_currency
    HAVING COUNT(*) > 1
  LOOP
    -- Delete duplicates, keeping only the first one
    DELETE FROM public.transactions
    WHERE external_reference = dup_record.external_reference
      AND user_id = dup_record.user_id
      AND crypto_currency = dup_record.crypto_currency
      AND transaction_type = 'BUY'
      AND created_at > dup_record.first_created;
    
    RAISE NOTICE 'Removed duplicate BUY transaction: % for user %', dup_record.external_reference, dup_record.user_id;
  END LOOP;
END $$;

-- Create unique index to prevent future duplicates for BUY transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_buy_reference 
ON public.transactions(external_reference, user_id, crypto_currency)
WHERE external_reference IS NOT NULL AND transaction_type = 'BUY';

-- Add comment
COMMENT ON INDEX idx_transactions_unique_buy_reference IS 
'Prevents duplicate BUY transactions: same external_reference + user_id + crypto_currency can only exist once for BUY transactions';
