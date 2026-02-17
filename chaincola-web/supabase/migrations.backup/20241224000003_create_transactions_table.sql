-- Create transactions table for storing all types of cryptocurrency transactions
-- Supports buy, sell, send, receive, deposit, withdrawal, and other transaction types

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- BUY, SELL, SEND, RECEIVE, DEPOSIT, WITHDRAWAL, TRANSFER
  crypto_currency TEXT NOT NULL, -- BTC, ETH, USDT, USDC, XRP, TRX, etc.
  network TEXT NOT NULL DEFAULT 'mainnet', -- mainnet, testnet
  
  -- Amount fields (vary by transaction type)
  crypto_amount DECIMAL(20, 8), -- Amount of cryptocurrency
  fiat_amount DECIMAL(20, 8), -- Amount in fiat currency (NGN, USD, etc.)
  fiat_currency TEXT DEFAULT 'NGN', -- Fiat currency code
  
  -- Fee fields
  fee_amount DECIMAL(20, 8), -- Fee charged
  fee_percentage DECIMAL(5, 2), -- Fee percentage if applicable
  fee_currency TEXT, -- Currency of the fee (crypto or fiat)
  
  -- Transaction details
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED, CANCELLED, CONFIRMING
  from_address TEXT, -- Source address
  to_address TEXT, -- Destination address
  transaction_hash TEXT, -- Blockchain transaction hash
  block_number BIGINT, -- Block number if confirmed
  confirmations INTEGER DEFAULT 0, -- Number of confirmations
  
  -- External service references
  external_order_id TEXT, -- Order ID from exchange (e.g., Luno)
  external_transaction_id TEXT, -- Transaction ID from external service
  external_reference TEXT, -- Any external reference number
  
  -- Metadata
  metadata JSONB, -- Additional transaction metadata
  notes TEXT, -- User notes or description
  error_message TEXT, -- Error message if transaction failed
  
  -- Related transaction IDs
  related_transaction_id UUID REFERENCES public.transactions(id), -- For linked transactions
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ, -- When the transaction was completed
  confirmed_at TIMESTAMPTZ, -- When transaction was confirmed on blockchain
  
  -- Constraints
  CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('BUY', 'SELL', 'SEND', 'RECEIVE', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWAP')),
  CONSTRAINT valid_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'CONFIRMING', 'CONFIRMED'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON public.transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_crypto_currency ON public.transactions(crypto_currency);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON public.transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON public.transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_hash ON public.transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_external_order_id ON public.transactions(external_order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_address ON public.transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON public.transactions(from_address);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON public.transactions
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can insert their own transactions
CREATE POLICY "Users can insert own transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert transactions
CREATE POLICY "Admins can insert transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Users can update their own transactions
CREATE POLICY "Users can update own transactions"
  ON public.transactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all transactions
CREATE POLICY "Admins can update all transactions"
  ON public.transactions
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Set completed_at when status changes to COMPLETED or CONFIRMED
  IF NEW.status IN ('COMPLETED', 'CONFIRMED') AND OLD.status NOT IN ('COMPLETED', 'CONFIRMED') THEN
    NEW.completed_at = COALESCE(NEW.completed_at, NOW());
  END IF;
  
  -- Set confirmed_at when transaction is confirmed
  IF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on transaction update
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transactions_updated_at();

-- Add comments
COMMENT ON TABLE public.transactions IS 'Stores all types of cryptocurrency transactions';
COMMENT ON COLUMN public.transactions.transaction_type IS 'Type of transaction: BUY, SELL, SEND, RECEIVE, DEPOSIT, WITHDRAWAL, TRANSFER, SWAP';
COMMENT ON COLUMN public.transactions.crypto_amount IS 'Amount of cryptocurrency involved';
COMMENT ON COLUMN public.transactions.fiat_amount IS 'Amount in fiat currency (NGN, USD, etc.)';
COMMENT ON COLUMN public.transactions.fee_amount IS 'Fee charged on the transaction';
COMMENT ON COLUMN public.transactions.transaction_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN public.transactions.confirmations IS 'Number of blockchain confirmations';
COMMENT ON COLUMN public.transactions.external_order_id IS 'Order ID from external exchange (e.g., Luno)';
COMMENT ON COLUMN public.transactions.metadata IS 'Additional transaction metadata in JSON format';
COMMENT ON COLUMN public.transactions.status IS 'Transaction status: PENDING, COMPLETED, FAILED, CANCELLED, CONFIRMING, CONFIRMED';
COMMENT ON COLUMN public.transactions.related_transaction_id IS 'Reference to related transaction (e.g., send/receive pair)';

















