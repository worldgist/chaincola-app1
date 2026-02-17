-- Update sells table schema to match function requirements
-- This migration ensures all fields used by sell-btc and execute-luno-sell functions exist

-- Create sells table if it doesn't exist
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
  quote_expires_at TIMESTAMPTZ, -- Quote valid for 60 seconds
  
  -- Transaction tracking
  btc_tx_hash TEXT, -- Bitcoin transaction hash when BTC sent to Luno
  luno_order_id TEXT, -- Luno order ID after selling on exchange
  
  -- Lock tracking
  locked_btc_amount DECIMAL(20, 8) DEFAULT 0, -- Amount locked for this sell
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (spread, market rate, execution_price, etc.)
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT positive_btc_amount CHECK (btc_amount > 0),
  CONSTRAINT positive_quoted_ngn CHECK (quoted_ngn > 0)
);

-- Add any missing columns if table already exists
DO $$
BEGIN
  -- Add ngn_received if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'ngn_received'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN ngn_received DECIMAL(20, 2);
  END IF;

  -- Add profit if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'profit'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN profit DECIMAL(20, 2);
  END IF;

  -- Add quote_expires_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'quote_expires_at'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN quote_expires_at TIMESTAMPTZ;
  END IF;

  -- Add btc_tx_hash if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'btc_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN btc_tx_hash TEXT;
  END IF;

  -- Add luno_order_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'luno_order_id'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN luno_order_id TEXT;
  END IF;

  -- Add locked_btc_amount if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'locked_btc_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_btc_amount DECIMAL(20, 8) DEFAULT 0;
  END IF;

  -- Add metadata if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add completed_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  -- Update status constraint if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'sells' 
    AND constraint_name = 'valid_sell_status'
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS valid_sell_status;
  END IF;

  -- Add updated constraint
  ALTER TABLE public.sells ADD CONSTRAINT valid_sell_status CHECK (status IN (
    'INITIATED', 'QUOTED', 'BTC_SENT', 'BTC_CREDITED_ON_LUNO', 
    'SOLD_ON_LUNO', 'COMPLETED', 'SELL_FAILED', 'EXPIRED'
  ));

END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_sells_user_id ON public.sells(user_id);
CREATE INDEX IF NOT EXISTS idx_sells_status ON public.sells(status);
CREATE INDEX IF NOT EXISTS idx_sells_created_at ON public.sells(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sells_luno_order_id ON public.sells(luno_order_id);
CREATE INDEX IF NOT EXISTS idx_sells_btc_tx_hash ON public.sells(btc_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_quote_expires_at ON public.sells(quote_expires_at) WHERE quote_expires_at IS NOT NULL;

-- Enable RLS if not already enabled
ALTER TABLE public.sells ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view own sells" ON public.sells;
DROP POLICY IF EXISTS "Users can insert own sells" ON public.sells;
DROP POLICY IF EXISTS "Users can update own sells" ON public.sells;
DROP POLICY IF EXISTS "Admins can view all sells" ON public.sells;
DROP POLICY IF EXISTS "Service role can manage sells" ON public.sells;

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

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_sells_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS update_sells_updated_at ON public.sells;
CREATE TRIGGER update_sells_updated_at
  BEFORE UPDATE ON public.sells
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sells_updated_at();

-- Comments
COMMENT ON TABLE public.sells IS 'Tracks BTC sell orders with status flow: INITIATED → QUOTED → BTC_SENT → BTC_CREDITED_ON_LUNO → SOLD_ON_LUNO → COMPLETED';
COMMENT ON COLUMN public.sells.sell_id IS 'Unique identifier for sell order';
COMMENT ON COLUMN public.sells.user_id IS 'User who initiated the sell';
COMMENT ON COLUMN public.sells.btc_amount IS 'Amount of BTC to sell';
COMMENT ON COLUMN public.sells.quoted_ngn IS 'NGN amount quoted at initiation (frozen)';
COMMENT ON COLUMN public.sells.ngn_received IS 'Actual NGN received from Luno after sell';
COMMENT ON COLUMN public.sells.profit IS 'Difference between ngn_received and quoted_ngn';
COMMENT ON COLUMN public.sells.status IS 'Current status of the sell order';
COMMENT ON COLUMN public.sells.quote_expires_at IS 'When the quote expires (60 seconds from creation)';
COMMENT ON COLUMN public.sells.btc_tx_hash IS 'Bitcoin transaction hash when BTC sent to Luno';
COMMENT ON COLUMN public.sells.luno_order_id IS 'Luno order ID after selling on exchange';
COMMENT ON COLUMN public.sells.locked_btc_amount IS 'Amount of BTC locked for this sell';
COMMENT ON COLUMN public.sells.metadata IS 'Additional data: market_rate, spread_percentage, platform_fee_percentage, execution_price, etc.';









