-- Create admin_revenue table to track all fees and charges collected by the platform
-- This provides a centralized record of all revenue from fees

CREATE TABLE IF NOT EXISTS public.admin_revenue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Revenue source details
  revenue_type TEXT NOT NULL, -- 'DEPOSIT_FEE', 'SEND_FEE', 'BUY_FEE', 'SELL_FEE', 'WITHDRAWAL_FEE', etc.
  source TEXT NOT NULL, -- 'FLUTTERWAVE', 'BITCOIN_SEND', 'ETHEREUM_SEND', 'SOLANA_SEND', 'LUNO_BUY', 'LUNO_SELL', etc.
  
  -- Amount details
  amount DECIMAL(20, 8) NOT NULL, -- Fee amount collected
  currency TEXT NOT NULL, -- Currency of the fee (NGN, BTC, ETH, SOL, etc.)
  amount_ngn DECIMAL(20, 8), -- Equivalent amount in NGN (for reporting)
  
  -- Fee details
  fee_percentage DECIMAL(5, 2), -- Fee percentage charged (e.g., 3.00 for 3%)
  base_amount DECIMAL(20, 8), -- Base amount the fee was calculated from
  
  -- Related transaction
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User who paid the fee
  
  -- Metadata
  metadata JSONB, -- Additional details (transaction hash, external IDs, etc.)
  notes TEXT, -- Optional notes
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT valid_revenue_type CHECK (revenue_type IN (
    'DEPOSIT_FEE', 'SEND_FEE', 'BUY_FEE', 'SELL_FEE', 
    'WITHDRAWAL_FEE', 'TRANSFER_FEE', 'SWAP_FEE', 'OTHER'
  )),
  CONSTRAINT valid_currency CHECK (currency IN (
    'NGN', 'USD', 'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BUSD', 'DAI'
  ))
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_admin_revenue_revenue_type ON public.admin_revenue(revenue_type);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_source ON public.admin_revenue(source);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_currency ON public.admin_revenue(currency);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_user_id ON public.admin_revenue(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_transaction_id ON public.admin_revenue(transaction_id);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_created_at ON public.admin_revenue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_type_date ON public.admin_revenue(revenue_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.admin_revenue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Admins can view admin revenue" ON public.admin_revenue;
DROP POLICY IF EXISTS "Service role can insert admin revenue" ON public.admin_revenue;
DROP POLICY IF EXISTS "Admins can update admin revenue" ON public.admin_revenue;

-- Only admins can view admin revenue
CREATE POLICY "Admins can view admin revenue"
  ON public.admin_revenue
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Only service role can insert admin revenue (called from Edge Functions)
CREATE POLICY "Service role can insert admin revenue"
  ON public.admin_revenue
  FOR INSERT
  WITH CHECK (true); -- Edge Functions use service role key

-- Only admins can update admin revenue
CREATE POLICY "Admins can update admin revenue"
  ON public.admin_revenue
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_admin_revenue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS update_admin_revenue_updated_at ON public.admin_revenue;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_admin_revenue_updated_at
  BEFORE UPDATE ON public.admin_revenue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_admin_revenue_updated_at();

-- Function to record admin revenue from fees
-- This function should be called whenever a fee is charged
CREATE OR REPLACE FUNCTION public.record_admin_revenue(
  p_revenue_type TEXT,
  p_source TEXT,
  p_amount DECIMAL,
  p_currency TEXT,
  p_fee_percentage DECIMAL DEFAULT NULL,
  p_base_amount DECIMAL DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_revenue_id UUID;
  v_amount_ngn DECIMAL;
  v_crypto_price DECIMAL;
BEGIN
  -- Validate revenue type
  IF p_revenue_type NOT IN ('DEPOSIT_FEE', 'SEND_FEE', 'BUY_FEE', 'SELL_FEE', 'WITHDRAWAL_FEE', 'TRANSFER_FEE', 'SWAP_FEE', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid revenue_type: %', p_revenue_type;
  END IF;
  
  -- Validate currency
  IF p_currency NOT IN ('NGN', 'USD', 'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BUSD', 'DAI') THEN
    RAISE EXCEPTION 'Invalid currency: %', p_currency;
  END IF;
  
  -- Calculate NGN equivalent if not NGN
  IF p_currency = 'NGN' THEN
    v_amount_ngn := p_amount;
  ELSE
    -- Try to get current crypto price from crypto_rates table
    SELECT rate INTO v_crypto_price
    FROM public.crypto_rates
    WHERE crypto_symbol = p_currency
      AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If price found, calculate NGN equivalent
    IF v_crypto_price IS NOT NULL THEN
      v_amount_ngn := p_amount * v_crypto_price;
    ELSE
      -- If price not found, set to NULL (can be updated later)
      v_amount_ngn := NULL;
    END IF;
  END IF;
  
  -- Insert revenue record
  INSERT INTO public.admin_revenue (
    revenue_type,
    source,
    amount,
    currency,
    amount_ngn,
    fee_percentage,
    base_amount,
    transaction_id,
    user_id,
    metadata,
    notes
  ) VALUES (
    p_revenue_type,
    p_source,
    p_amount,
    p_currency,
    v_amount_ngn,
    p_fee_percentage,
    p_base_amount,
    p_transaction_id,
    p_user_id,
    p_metadata,
    p_notes
  )
  RETURNING id INTO v_revenue_id;
  
  RETURN v_revenue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_admin_revenue(
  TEXT, TEXT, DECIMAL, TEXT, DECIMAL, DECIMAL, UUID, UUID, JSONB, TEXT
) TO service_role, authenticated;

-- Add comments
COMMENT ON TABLE public.admin_revenue IS 'Tracks all fees and charges collected by the platform as admin revenue';
COMMENT ON COLUMN public.admin_revenue.revenue_type IS 'Type of revenue: DEPOSIT_FEE, SEND_FEE, BUY_FEE, SELL_FEE, etc.';
COMMENT ON COLUMN public.admin_revenue.source IS 'Source of revenue: FLUTTERWAVE, BITCOIN_SEND, ETHEREUM_SEND, etc.';
COMMENT ON COLUMN public.admin_revenue.amount IS 'Fee amount collected in original currency';
COMMENT ON COLUMN public.admin_revenue.amount_ngn IS 'Equivalent amount in NGN (for reporting)';
COMMENT ON FUNCTION public.record_admin_revenue IS 'Records admin revenue from fees. Should be called whenever a fee is charged.';

-- Drop view if exists (for idempotency)
DROP VIEW IF EXISTS public.admin_revenue_summary;

-- Create view for revenue summary by type
CREATE OR REPLACE VIEW public.admin_revenue_summary AS
SELECT 
  revenue_type,
  source,
  currency,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  SUM(COALESCE(amount_ngn, 0)) as total_amount_ngn,
  AVG(fee_percentage) as avg_fee_percentage,
  MIN(created_at) as first_revenue_date,
  MAX(created_at) as last_revenue_date
FROM public.admin_revenue
GROUP BY revenue_type, source, currency;

-- Grant select on view to admins
GRANT SELECT ON public.admin_revenue_summary TO authenticated;

COMMENT ON VIEW public.admin_revenue_summary IS 'Summary view of admin revenue grouped by type, source, and currency';

