-- Create BTC deposits tracking table
-- Tracks incoming BTC deposits with confirmation status
CREATE TABLE IF NOT EXISTS public.btc_deposits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  txid TEXT NOT NULL UNIQUE, -- Bitcoin transaction ID
  amount_btc DECIMAL(20, 8) NOT NULL,
  confirmations INTEGER DEFAULT 0 NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, AVAILABLE, LOCKED, SOLD
  to_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT valid_status CHECK (status IN ('PENDING', 'AVAILABLE', 'LOCKED', 'SOLD')),
  CONSTRAINT positive_amount CHECK (amount_btc > 0)
);

-- Create indexes for btc_deposits
CREATE INDEX IF NOT EXISTS idx_btc_deposits_user_id ON public.btc_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_btc_deposits_txid ON public.btc_deposits(txid);
CREATE INDEX IF NOT EXISTS idx_btc_deposits_status ON public.btc_deposits(status);
CREATE INDEX IF NOT EXISTS idx_btc_deposits_confirmations ON public.btc_deposits(confirmations);

-- Enable RLS
ALTER TABLE public.btc_deposits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for btc_deposits
CREATE POLICY "Users can view own BTC deposits"
  ON public.btc_deposits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all BTC deposits"
  ON public.btc_deposits
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage all deposits (for Edge Functions)
CREATE POLICY "Service role can manage BTC deposits"
  ON public.btc_deposits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create sells table
-- Tracks BTC sell orders with status flow: INITIATED → QUOTED → BTC_SENT → BTC_CREDITED_ON_LUNO → SOLD_ON_LUNO → COMPLETED
CREATE TABLE IF NOT EXISTS public.sells (
  sell_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Sell details
  btc_amount DECIMAL(20, 8) NOT NULL,
  quoted_ngn DECIMAL(20, 2) NOT NULL, -- Quote frozen at initiation
  ngn_received DECIMAL(20, 2), -- Actual NGN received from Luno
  profit DECIMAL(20, 2), -- profit = ngn_received - quoted_ngn
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'INITIATED',
  CONSTRAINT valid_sell_status CHECK (status IN (
    'INITIATED', 'QUOTED', 'BTC_SENT', 'BTC_CREDITED_ON_LUNO', 
    'SOLD_ON_LUNO', 'COMPLETED', 'SELL_FAILED', 'EXPIRED'
  )),
  
  -- Quote expiration
  quote_expires_at TIMESTAMPTZ, -- Quote valid for 30-60 seconds
  
  -- Transaction tracking
  btc_tx_hash TEXT, -- Bitcoin transaction hash when BTC sent to Luno
  luno_order_id TEXT, -- Luno order ID after selling on exchange
  
  -- Lock tracking
  locked_btc_amount DECIMAL(20, 8) DEFAULT 0, -- Amount locked for this sell
  
  -- Metadata
  metadata JSONB, -- Additional data (spread, market rate, etc.)
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT positive_btc_amount CHECK (btc_amount > 0),
  CONSTRAINT positive_quoted_ngn CHECK (quoted_ngn > 0)
);

-- Create indexes for sells
CREATE INDEX IF NOT EXISTS idx_sells_user_id ON public.sells(user_id);
CREATE INDEX IF NOT EXISTS idx_sells_status ON public.sells(status);
CREATE INDEX IF NOT EXISTS idx_sells_created_at ON public.sells(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sells_luno_order_id ON public.sells(luno_order_id);
CREATE INDEX IF NOT EXISTS idx_sells_btc_tx_hash ON public.sells(btc_tx_hash);

-- Enable RLS
ALTER TABLE public.sells ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sells
CREATE POLICY "Users can view own sells"
  ON public.sells
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sells"
  ON public.sells
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sells"
  ON public.sells
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all sells"
  ON public.sells
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage all sells (for Edge Functions)
CREATE POLICY "Service role can manage sells"
  ON public.sells
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add btc_locked column to wallet_balances if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'wallet_balances' 
    AND column_name = 'locked'
  ) THEN
    ALTER TABLE public.wallet_balances ADD COLUMN locked DECIMAL(20, 8) DEFAULT 0 NOT NULL;
    ALTER TABLE public.wallet_balances ADD CONSTRAINT positive_locked CHECK (locked >= 0);
  END IF;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_btc_deposits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_sells_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_btc_deposits_updated_at
  BEFORE UPDATE ON public.btc_deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_btc_deposits_updated_at();

CREATE TRIGGER update_sells_updated_at
  BEFORE UPDATE ON public.sells
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sells_updated_at();

-- Function to lock BTC for selling
CREATE OR REPLACE FUNCTION public.lock_btc_for_sell(
  p_user_id UUID,
  p_btc_amount DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_available_balance DECIMAL(20, 8);
  v_locked_amount DECIMAL(20, 8);
BEGIN
  -- Get available BTC balance (balance - locked)
  SELECT 
    COALESCE(balance, 0) - COALESCE(locked, 0)
  INTO v_available_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = 'BTC';

  -- Check if sufficient balance
  IF v_available_balance < p_btc_amount THEN
    RAISE EXCEPTION 'Insufficient BTC balance. Available: %, Required: %', v_available_balance, p_btc_amount;
  END IF;

  -- Lock the BTC
  UPDATE public.wallet_balances
  SET locked = COALESCE(locked, 0) + p_btc_amount
  WHERE user_id = p_user_id AND currency = 'BTC';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock BTC (on failure or cancellation)
CREATE OR REPLACE FUNCTION public.unlock_btc_for_sell(
  p_user_id UUID,
  p_btc_amount DECIMAL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.wallet_balances
  SET locked = GREATEST(COALESCE(locked, 0) - p_btc_amount, 0)
  WHERE user_id = p_user_id AND currency = 'BTC';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE public.btc_deposits IS 'Tracks incoming BTC deposits with confirmation status';
COMMENT ON TABLE public.sells IS 'Tracks BTC sell orders with status flow';
COMMENT ON FUNCTION public.lock_btc_for_sell IS 'Locks BTC amount for selling to prevent double-sell';
COMMENT ON FUNCTION public.unlock_btc_for_sell IS 'Unlocks BTC amount if sell fails or is cancelled';










