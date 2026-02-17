-- Create system_wallet table for tracking system inventory and liquidity
-- This acts as the market maker's inventory for instant sells

CREATE TABLE IF NOT EXISTS public.system_wallets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Crypto inventory balances
  btc_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  eth_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdt_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdc_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  xrp_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  sol_inventory DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  -- NGN float balance for paying out users
  ngn_float_balance DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create unique constraint to ensure only one system wallet exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_wallets_single ON public.system_wallets((1));

-- Insert initial system wallet if it doesn't exist
INSERT INTO public.system_wallets (id, btc_inventory, eth_inventory, usdt_inventory, usdc_inventory, xrp_inventory, sol_inventory, ngn_float_balance)
VALUES (1, 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.system_wallets ENABLE ROW LEVEL SECURITY;

-- Only service role can access system wallets (block all public access)
CREATE POLICY "Service role can access system wallets"
  ON public.system_wallets
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_system_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_system_wallets_updated_at
  BEFORE UPDATE ON public.system_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_wallets_updated_at();

-- Add comment
COMMENT ON TABLE public.system_wallets IS 'System wallet for market making. Tracks crypto inventory and NGN float balance for instant sells. Only one row exists with id=1.';
