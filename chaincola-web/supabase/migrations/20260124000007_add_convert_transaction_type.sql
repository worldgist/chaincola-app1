-- Add CONVERT transaction type to transactions table constraint
-- This allows auto-convert functionality to create CONVERT transaction records

-- Drop the existing constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS valid_transaction_type;

-- Add the constraint with CONVERT included
ALTER TABLE public.transactions ADD CONSTRAINT valid_transaction_type 
  CHECK (transaction_type IN ('BUY', 'SELL', 'SEND', 'RECEIVE', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWAP', 'CONVERT'));

-- Update the comment to reflect the new transaction type
COMMENT ON COLUMN public.transactions.transaction_type IS 'Type of transaction: BUY, SELL, SEND, RECEIVE, DEPOSIT, WITHDRAWAL, TRANSFER, SWAP, CONVERT';
