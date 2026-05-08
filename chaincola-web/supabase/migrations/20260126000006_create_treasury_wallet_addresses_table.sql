-- Create treasury_wallet_addresses table for storing treasury wallet addresses
-- These are addresses used by the system for receiving funds

CREATE TABLE IF NOT EXISTS public.treasury_wallet_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL, -- BTC, ETH, USDT, USDC, XRP, SOL
  network TEXT NOT NULL DEFAULT 'mainnet', -- mainnet, testnet
  address TEXT NOT NULL,
  label TEXT, -- Optional label/description
  is_active BOOLEAN DEFAULT true NOT NULL,
  notes TEXT, -- Additional notes
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(asset, network, address)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_addresses_asset ON public.treasury_wallet_addresses(asset);
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_addresses_network ON public.treasury_wallet_addresses(network);
CREATE INDEX IF NOT EXISTS idx_treasury_wallet_addresses_active ON public.treasury_wallet_addresses(is_active);

-- Enable RLS
ALTER TABLE public.treasury_wallet_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only admins can view treasury wallet addresses
CREATE POLICY "Admins can view treasury wallet addresses"
  ON public.treasury_wallet_addresses
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Only admins can insert treasury wallet addresses
CREATE POLICY "Admins can insert treasury wallet addresses"
  ON public.treasury_wallet_addresses
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Only admins can update treasury wallet addresses
CREATE POLICY "Admins can update treasury wallet addresses"
  ON public.treasury_wallet_addresses
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Only admins can delete treasury wallet addresses
CREATE POLICY "Admins can delete treasury wallet addresses"
  ON public.treasury_wallet_addresses
  FOR DELETE
  USING (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_treasury_wallet_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_treasury_wallet_addresses_updated_at
  BEFORE UPDATE ON public.treasury_wallet_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_treasury_wallet_addresses_updated_at();

-- Add comment
COMMENT ON TABLE public.treasury_wallet_addresses IS 'Treasury wallet addresses used by the system for receiving funds';
