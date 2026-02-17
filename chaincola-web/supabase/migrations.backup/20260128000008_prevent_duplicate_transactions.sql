-- Prevent duplicate transactions by adding unique constraint
-- This ensures that the same transaction_hash + user_id + crypto_currency combination can only exist once

-- First, remove any actual duplicates (keep the oldest one)
DO $$
DECLARE
  dup_record RECORD;
BEGIN
  FOR dup_record IN
    SELECT transaction_hash, user_id, crypto_currency, MIN(created_at) as first_created
    FROM public.transactions
    WHERE transaction_hash IS NOT NULL
    GROUP BY transaction_hash, user_id, crypto_currency
    HAVING COUNT(*) > 1
  LOOP
    -- Delete duplicates, keeping only the first one
    DELETE FROM public.transactions
    WHERE transaction_hash = dup_record.transaction_hash
      AND user_id = dup_record.user_id
      AND crypto_currency = dup_record.crypto_currency
      AND created_at > dup_record.first_created;
    
    RAISE NOTICE 'Removed duplicate transaction: % for user %', dup_record.transaction_hash, dup_record.user_id;
  END LOOP;
END $$;

-- Create unique index to prevent future duplicates
-- This prevents the same transaction from being inserted multiple times
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_hash_user_currency 
ON public.transactions(transaction_hash, user_id, crypto_currency)
WHERE transaction_hash IS NOT NULL;

-- Add comment
COMMENT ON INDEX idx_transactions_unique_hash_user_currency IS 
'Prevents duplicate transactions: same transaction_hash + user_id + crypto_currency can only exist once';
