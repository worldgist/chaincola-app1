-- Add fee_amount column to withdrawals table
-- This stores the withdrawal fee (3% of amount)

ALTER TABLE public.withdrawals
ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20, 2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.withdrawals.fee_amount IS 'Withdrawal fee amount (3% of withdrawal amount)';









