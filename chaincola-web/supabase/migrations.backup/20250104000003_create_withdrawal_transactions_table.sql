-- Create withdrawal_transactions table
-- This table tracks individual transaction records for each withdrawal
-- Each withdrawal can have multiple transaction records (debit, fee, transfer, etc.)

CREATE TABLE IF NOT EXISTS public.withdrawal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction Type
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'debit',           -- Initial balance debit
    'fee',             -- Fee deduction
    'transfer_init',   -- Transfer initiation
    'transfer_complete', -- Transfer completion
    'refund',          -- Refund if withdrawal fails
    'adjustment'       -- Manual adjustment
  )),
  
  -- Amount Information
  amount DECIMAL(20, 2) NOT NULL,
  currency TEXT DEFAULT 'NGN' NOT NULL,
  
  -- Transaction Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- External References
  external_transaction_id TEXT, -- External service transaction ID (e.g., Flutterwave)
  external_reference TEXT,      -- External reference number
  
  -- Transaction Details
  description TEXT,              -- Human-readable description
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional transaction metadata
  
  -- Error Handling
  error_message TEXT,            -- Error message if transaction failed
  error_code TEXT,               -- Error code if transaction failed
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ      -- When transaction was completed
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_withdrawal_id 
  ON public.withdrawal_transactions(withdrawal_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_user_id 
  ON public.withdrawal_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_type 
  ON public.withdrawal_transactions(transaction_type);

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_status 
  ON public.withdrawal_transactions(status);

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_created_at 
  ON public.withdrawal_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_external_id 
  ON public.withdrawal_transactions(external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_user_withdrawal 
  ON public.withdrawal_transactions(user_id, withdrawal_id);

-- Enable RLS
ALTER TABLE public.withdrawal_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for withdrawal_transactions

-- Users can view their own withdrawal transactions
CREATE POLICY "Users can view own withdrawal transactions"
  ON public.withdrawal_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all withdrawal transactions
CREATE POLICY "Admins can view all withdrawal transactions"
  ON public.withdrawal_transactions
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can insert withdrawal transactions (for system operations)
CREATE POLICY "Service role can insert withdrawal transactions"
  ON public.withdrawal_transactions
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Admins can insert withdrawal transactions (for manual adjustments)
CREATE POLICY "Admins can insert withdrawal transactions"
  ON public.withdrawal_transactions
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can update withdrawal transactions
CREATE POLICY "Admins can update withdrawal transactions"
  ON public.withdrawal_transactions
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_withdrawal_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Set completed_at when status changes to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on transaction update
CREATE TRIGGER update_withdrawal_transactions_updated_at
  BEFORE UPDATE ON public.withdrawal_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_withdrawal_transactions_updated_at();

-- Function to get withdrawal transaction summary
CREATE OR REPLACE FUNCTION public.get_withdrawal_transaction_summary(p_withdrawal_id UUID)
RETURNS TABLE (
  total_debits DECIMAL(20, 2),
  total_fees DECIMAL(20, 2),
  total_refunds DECIMAL(20, 2),
  transaction_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END), 0)::DECIMAL(20, 2) as total_debits,
    COALESCE(SUM(CASE WHEN transaction_type = 'fee' THEN amount ELSE 0 END), 0)::DECIMAL(20, 2) as total_fees,
    COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END), 0)::DECIMAL(20, 2) as total_refunds,
    COUNT(*)::BIGINT as transaction_count,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_count
  FROM public.withdrawal_transactions
  WHERE withdrawal_id = p_withdrawal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_withdrawal_transaction_summary(UUID) TO authenticated;

-- Add comments
COMMENT ON TABLE public.withdrawal_transactions IS 'Tracks individual transaction records for each withdrawal (debits, fees, transfers, refunds, etc.)';
COMMENT ON COLUMN public.withdrawal_transactions.transaction_type IS 'Type of transaction: debit, fee, transfer_init, transfer_complete, refund, adjustment';
COMMENT ON COLUMN public.withdrawal_transactions.status IS 'Transaction status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN public.withdrawal_transactions.external_transaction_id IS 'External service transaction ID (e.g., Flutterwave transfer ID)';
COMMENT ON COLUMN public.withdrawal_transactions.metadata IS 'Additional transaction metadata (API responses, error details, etc.)';
COMMENT ON FUNCTION public.get_withdrawal_transaction_summary IS 'Get summary statistics for all transactions related to a withdrawal';









