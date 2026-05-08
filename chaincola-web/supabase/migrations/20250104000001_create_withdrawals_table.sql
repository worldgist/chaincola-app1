-- Create withdrawals table to store user withdrawal requests
-- This table tracks withdrawal requests and their status through the Flutterwave transfer process

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(20, 2) NOT NULL,
  currency TEXT DEFAULT 'NGN' NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  bank_code TEXT,
  status TEXT DEFAULT 'processing' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  transfer_id TEXT,
  transfer_reference TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON public.withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_transfer_reference ON public.withdrawals(transfer_reference);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON public.withdrawals(user_id, status);

-- Enable RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for withdrawals

-- Users can view their own withdrawals
CREATE POLICY "Users can view own withdrawals"
  ON public.withdrawals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all withdrawals
CREATE POLICY "Admins can view all withdrawals"
  ON public.withdrawals
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can insert their own withdrawals
CREATE POLICY "Users can insert own withdrawals"
  ON public.withdrawals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own withdrawals (for status updates)
CREATE POLICY "Users can update own withdrawals"
  ON public.withdrawals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all withdrawals
CREATE POLICY "Admins can update all withdrawals"
  ON public.withdrawals
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_withdrawals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on withdrawal update
CREATE TRIGGER update_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_withdrawals_updated_at();

-- Add comments
COMMENT ON TABLE public.withdrawals IS 'Stores user withdrawal requests and their processing status';
COMMENT ON COLUMN public.withdrawals.status IS 'Withdrawal status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN public.withdrawals.transfer_id IS 'Flutterwave transfer ID';
COMMENT ON COLUMN public.withdrawals.transfer_reference IS 'Flutterwave transfer reference';
COMMENT ON COLUMN public.withdrawals.metadata IS 'Additional metadata about the withdrawal (errors, transfer details, etc.)';









