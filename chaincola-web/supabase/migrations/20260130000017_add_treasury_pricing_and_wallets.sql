-- Add Treasury Pricing Engine and Wallet Management
-- This migration adds tables for pricing rules, price overrides, and wallet management

-- ============================================================================
-- 1. CREATE pricing_rules TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL')),
  
  -- Pricing parameters
  buy_spread_percent DECIMAL(5, 2) DEFAULT 0.5 NOT NULL,
  sell_spread_percent DECIMAL(5, 2) DEFAULT 0.7 NOT NULL,
  platform_fee_percent DECIMAL(5, 2) DEFAULT 0.3 NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_rules_asset ON public.pricing_rules(asset);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON public.pricing_rules(is_active) WHERE is_active = true;

-- Create partial unique index to ensure one active rule per asset
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_rules_unique_active 
  ON public.pricing_rules(asset) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

-- Only admins can view pricing rules
CREATE POLICY "Admins can view pricing rules"
  ON public.pricing_rules
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage pricing rules
CREATE POLICY "Service role can manage pricing rules"
  ON public.pricing_rules
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. CREATE price_overrides TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL')),
  
  -- Price information
  market_price DECIMAL(20, 8) NOT NULL,
  override_price DECIMAL(20, 8) NOT NULL,
  
  -- Account and context
  account TEXT NOT NULL, -- 'Main Operations', 'Trading Account', etc.
  reason TEXT NOT NULL,
  
  -- Expiry
  expiry_time TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED')),
  
  -- Admin who created
  admin_id UUID REFERENCES auth.users(id) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_price_overrides_asset ON public.price_overrides(asset);
CREATE INDEX IF NOT EXISTS idx_price_overrides_status ON public.price_overrides(status);
CREATE INDEX IF NOT EXISTS idx_price_overrides_expiry ON public.price_overrides(expiry_time);
CREATE INDEX IF NOT EXISTS idx_price_overrides_active ON public.price_overrides(status, expiry_time) 
  WHERE status = 'ACTIVE';

-- Enable RLS
ALTER TABLE public.price_overrides ENABLE ROW LEVEL SECURITY;

-- Only admins can view price overrides
CREATE POLICY "Admins can view price overrides"
  ON public.price_overrides
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage price overrides
CREATE POLICY "Service role can manage price overrides"
  ON public.price_overrides
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to auto-expire price overrides
CREATE OR REPLACE FUNCTION public.expire_price_overrides()
RETURNS void AS $$
BEGIN
  UPDATE public.price_overrides
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE' 
    AND expiry_time < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. CREATE treasury_wallets TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Wallet information
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EXODUS', 'TRUST')),
  
  -- Wallet addresses (one per asset)
  btc_address TEXT,
  eth_address TEXT,
  usdt_address TEXT,
  usdc_address TEXT,
  xrp_address TEXT,
  sol_address TEXT,
  
  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_type ON public.treasury_wallets(type);
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_active ON public.treasury_wallets(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.treasury_wallets ENABLE ROW LEVEL SECURITY;

-- Only admins can view treasury wallets
CREATE POLICY "Admins can view treasury wallets"
  ON public.treasury_wallets
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage treasury wallets
CREATE POLICY "Service role can manage treasury wallets"
  ON public.treasury_wallets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default wallets if they don't exist
INSERT INTO public.treasury_wallets (name, type, description)
VALUES 
  ('Exodus Wallet', 'EXODUS', 'Primary custody wallet for long-term holdings'),
  ('Trust Wallet', 'TRUST', 'Secondary operational wallet')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. CREATE treasury_wallet_balances TABLE (for caching on-chain balances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_wallet_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Wallet reference
  wallet_id UUID REFERENCES public.treasury_wallets(id) ON DELETE CASCADE NOT NULL,
  
  -- Asset and balance
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL')),
  balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  balance_usd DECIMAL(20, 2) DEFAULT 0,
  
  -- Metadata
  last_fetched_at TIMESTAMPTZ,
  fetch_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one balance record per wallet-asset combination
  UNIQUE(wallet_id, asset)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_balances_wallet ON public.treasury_wallet_balances(wallet_id);
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_balances_asset ON public.treasury_wallet_balances(asset);
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_balances_last_fetched ON public.treasury_wallet_balances(last_fetched_at DESC);

-- Enable RLS
ALTER TABLE public.treasury_wallet_balances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view treasury wallet balances" ON public.treasury_wallet_balances;
DROP POLICY IF EXISTS "Service role can manage treasury wallet balances" ON public.treasury_wallet_balances;

-- Only admins can view treasury wallet balances
CREATE POLICY "Admins can view treasury wallet balances"
  ON public.treasury_wallet_balances
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can manage treasury wallet balances
CREATE POLICY "Service role can manage treasury wallet balances"
  ON public.treasury_wallet_balances
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. ENHANCE settlements TABLE (if needed)
-- ============================================================================

-- Check if settlements table exists and add missing columns
DO $$
BEGIN
  -- Check if table exists first
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'settlements'
  ) THEN
    -- Add columns if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'transaction_hash'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN transaction_hash TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'confirmations'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN confirmations INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'required_confirmations'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN required_confirmations INTEGER DEFAULT 12;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'usd_value'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN usd_value DECIMAL(20, 2);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'transaction_fee'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN transaction_fee DECIMAL(20, 8);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'network'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN network TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'destination_address'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN destination_address TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'exchange'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN exchange TEXT;
    END IF;
    
    -- Add asset column if it doesn't exist (for crypto settlements)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'settlements' 
      AND column_name = 'asset'
    ) THEN
      ALTER TABLE public.settlements ADD COLUMN asset TEXT CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'));
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 6. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE public.pricing_rules IS 'Pricing rules for buy/sell spreads and platform fees per asset';
COMMENT ON TABLE public.price_overrides IS 'Temporary price overrides for market stabilization';
COMMENT ON TABLE public.treasury_wallets IS 'Main treasury wallets (Exodus, Trust) with addresses';
COMMENT ON TABLE public.treasury_wallet_balances IS 'Cached on-chain balances for treasury wallets';
