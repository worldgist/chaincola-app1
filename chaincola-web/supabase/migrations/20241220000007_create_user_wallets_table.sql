-- Create crypto_wallets table for storing user wallet addresses
-- Supports multiple cryptocurrencies (Bitcoin, Ethereum, etc.)

CREATE TABLE IF NOT EXISTS public.crypto_wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL, -- BTC, ETH, USDT, USDC, etc.
  network TEXT NOT NULL DEFAULT 'mainnet', -- mainnet, testnet, etc.
  address TEXT NOT NULL,
  mnemonic_encrypted TEXT, -- Encrypted mnemonic phrase (optional, for recovery)
  private_key_encrypted TEXT, -- Encrypted private key (optional)
  public_key TEXT, -- Public key
  derivation_path TEXT, -- BIP44 derivation path (e.g., m/44'/0'/0'/0/0)
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, asset, network)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user_id ON public.crypto_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_asset ON public.crypto_wallets(asset);
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_address ON public.crypto_wallets(address);
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user_asset ON public.crypto_wallets(user_id, asset);

-- Enable RLS
ALTER TABLE public.crypto_wallets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crypto_wallets
-- Users can view their own wallets
CREATE POLICY "Users can view own wallets"
  ON public.crypto_wallets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all wallets
CREATE POLICY "Admins can view all wallets"
  ON public.crypto_wallets
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can insert their own wallets
CREATE POLICY "Users can insert own wallets"
  ON public.crypto_wallets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert wallets
CREATE POLICY "Admins can insert wallets"
  ON public.crypto_wallets
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Users can update their own wallets
CREATE POLICY "Users can update own wallets"
  ON public.crypto_wallets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all wallets
CREATE POLICY "Admins can update all wallets"
  ON public.crypto_wallets
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_crypto_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on wallet update
CREATE TRIGGER update_crypto_wallets_updated_at
  BEFORE UPDATE ON public.crypto_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crypto_wallets_updated_at();

-- Add comments
COMMENT ON TABLE public.crypto_wallets IS 'Stores user wallet addresses for different cryptocurrencies';
COMMENT ON COLUMN public.crypto_wallets.mnemonic_encrypted IS 'Encrypted mnemonic phrase for wallet recovery (optional)';
COMMENT ON COLUMN public.crypto_wallets.private_key_encrypted IS 'Encrypted private key (optional, for non-HD wallets)';
COMMENT ON COLUMN public.crypto_wallets.derivation_path IS 'BIP44 derivation path used to generate this address';

