-- Add REFUNDED status and REFUND transaction type to transactions table
-- This is required for the admin refund transaction feature

-- Drop the existing constraint
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS valid_status;

-- Add REFUNDED to valid statuses
ALTER TABLE public.transactions
ADD CONSTRAINT valid_status CHECK (
  status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'CONFIRMING', 'CONFIRMED', 'REFUNDED')
);

-- Drop the existing transaction type constraint
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS valid_transaction_type;

-- Add REFUND to valid transaction types
ALTER TABLE public.transactions
ADD CONSTRAINT valid_transaction_type CHECK (
  transaction_type IN ('BUY', 'SELL', 'SEND', 'RECEIVE', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWAP', 'REFUND')
);

-- Update comment to reflect new status
COMMENT ON COLUMN public.transactions.status IS 'Transaction status: PENDING, COMPLETED, FAILED, CANCELLED, CONFIRMING, CONFIRMED, REFUNDED';

-- Update comment to reflect new transaction type
COMMENT ON COLUMN public.transactions.transaction_type IS 'Type of transaction: BUY, SELL, SEND, RECEIVE, DEPOSIT, WITHDRAWAL, TRANSFER, SWAP, REFUND';
