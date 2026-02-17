-- Create sell_transactions table for storing cryptocurrency sell transactions
-- Tracks all sell orders placed through Luno API with fees

CREATE TABLE IF NOT EXISTS public.sell_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_currency TEXT NOT NULL, -- BTC, ETH, USDT, USDC, XRP, TRX
  crypto_amount DECIMAL(20, 8) NOT NULL, -- Amount of crypto to sell
  ngn_amount DECIMAL(20, 8), -- Amount of NGN received (filled after order completion)
  fee_amount DECIMAL(20, 8), -- Fee charged (calculated after order completion)
  fee_percentage DECIMAL(5, 2) NOT NULL DEFAULT 5.00, -- Fee percentage (default 5%)
  luno_order_id TEXT, -- Order ID returned from Luno API
  client_order_id TEXT, -- Optional client order ID for tracking
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED, CANCELLED
  luno_pair TEXT NOT NULL, -- Luno trading pair (e.g., XBTNGN, ETHNGN)
  error_message TEXT, -- Error message if transaction failed
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ -- When the transaction was completed
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sell_transactions_user_id ON public.sell_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_sell_transactions_crypto_currency ON public.sell_transactions(crypto_currency);
CREATE INDEX IF NOT EXISTS idx_sell_transactions_status ON public.sell_transactions(status);
CREATE INDEX IF NOT EXISTS idx_sell_transactions_luno_order_id ON public.sell_transactions(luno_order_id);
CREATE INDEX IF NOT EXISTS idx_sell_transactions_user_status ON public.sell_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_transactions_created_at ON public.sell_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.sell_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sell_transactions
-- Users can view their own transactions
CREATE POLICY "Users can view own sell transactions"
  ON public.sell_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "Admins can view all sell transactions"
  ON public.sell_transactions
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can insert their own transactions
CREATE POLICY "Users can insert own sell transactions"
  ON public.sell_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert transactions
CREATE POLICY "Admins can insert sell transactions"
  ON public.sell_transactions
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Users can update their own transactions
CREATE POLICY "Users can update own sell transactions"
  ON public.sell_transactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all transactions
CREATE POLICY "Admins can update all sell transactions"
  ON public.sell_transactions
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_sell_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Set completed_at when status changes to COMPLETED
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on transaction update
CREATE TRIGGER update_sell_transactions_updated_at
  BEFORE UPDATE ON public.sell_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sell_transactions_updated_at();

-- Add comments
COMMENT ON TABLE public.sell_transactions IS 'Stores cryptocurrency sell transactions with fee tracking';
COMMENT ON COLUMN public.sell_transactions.crypto_amount IS 'Amount of cryptocurrency being sold';
COMMENT ON COLUMN public.sell_transactions.ngn_amount IS 'Amount of NGN received (filled after order completion)';
COMMENT ON COLUMN public.sell_transactions.fee_amount IS 'Fee charged on the transaction (calculated after order completion)';
COMMENT ON COLUMN public.sell_transactions.luno_order_id IS 'Order ID returned from Luno API';
COMMENT ON COLUMN public.sell_transactions.status IS 'Transaction status: PENDING, COMPLETED, FAILED, CANCELLED';
COMMENT ON COLUMN public.sell_transactions.fee_percentage IS 'Fee percentage applied (default 5%)';

















