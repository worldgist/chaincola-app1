-- Combined migration: Create system_wallets table (if not exists) and add main wallet address columns
-- This ensures the table exists before adding columns

-- Step 1: Create system_wallets table if it doesn't exist
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'system_wallets' 
    AND policyname = 'Service role can access system wallets'
  ) THEN
    CREATE POLICY "Service role can access system wallets"
      ON public.system_wallets
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_system_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_system_wallets_updated_at ON public.system_wallets;
CREATE TRIGGER update_system_wallets_updated_at
  BEFORE UPDATE ON public.system_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_wallets_updated_at();

-- Step 2: Add main wallet address columns (if they don't exist)
ALTER TABLE public.system_wallets
ADD COLUMN IF NOT EXISTS btc_main_address TEXT,
ADD COLUMN IF NOT EXISTS eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS sol_main_address TEXT,
ADD COLUMN IF NOT EXISTS xrp_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdt_eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdt_tron_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdc_eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdc_sol_main_address TEXT;

-- Add comments
COMMENT ON COLUMN public.system_wallets.btc_main_address IS 'Main Bitcoin wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.eth_main_address IS 'Main Ethereum wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.sol_main_address IS 'Main Solana wallet address (treasury vault). Also used for USDC SOL. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.xrp_main_address IS 'Main XRP wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdt_eth_main_address IS 'USDT on Ethereum network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdt_tron_main_address IS 'USDT on TRON network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdc_eth_main_address IS 'USDC on Ethereum network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdc_sol_main_address IS 'USDC on Solana network main wallet address. Only address stored, never private keys.';

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_wallets_btc_address ON public.system_wallets(btc_main_address) WHERE btc_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_eth_address ON public.system_wallets(eth_main_address) WHERE eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_sol_address ON public.system_wallets(sol_main_address) WHERE sol_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_xrp_address ON public.system_wallets(xrp_main_address) WHERE xrp_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdt_eth_address ON public.system_wallets(usdt_eth_main_address) WHERE usdt_eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdt_tron_address ON public.system_wallets(usdt_tron_main_address) WHERE usdt_tron_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdc_eth_address ON public.system_wallets(usdc_eth_main_address) WHERE usdc_eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdc_sol_address ON public.system_wallets(usdc_sol_main_address) WHERE usdc_sol_main_address IS NOT NULL;
