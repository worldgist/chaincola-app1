-- Create user_wallets table for unified wallet balances
-- This consolidates all user balances (NGN and crypto) in one table

CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ngn_balance DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  btc_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  eth_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdt_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  usdc_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  xrp_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  sol_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT positive_ngn CHECK (ngn_balance >= 0),
  CONSTRAINT positive_btc CHECK (btc_balance >= 0),
  CONSTRAINT positive_eth CHECK (eth_balance >= 0),
  CONSTRAINT positive_usdt CHECK (usdt_balance >= 0),
  CONSTRAINT positive_usdc CHECK (usdc_balance >= 0),
  CONSTRAINT positive_xrp CHECK (xrp_balance >= 0),
  CONSTRAINT positive_sol CHECK (sol_balance >= 0)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON public.user_wallets(user_id);

-- Enable RLS
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_wallets'
    AND policyname = 'Users can view own wallet'
  ) THEN
    CREATE POLICY "Users can view own wallet"
      ON public.user_wallets
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_wallets'
    AND policyname = 'Users can update own wallet'
  ) THEN
    CREATE POLICY "Users can update own wallet"
      ON public.user_wallets
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_wallets'
    AND policyname = 'Service role can manage all wallets'
  ) THEN
    CREATE POLICY "Service role can manage all wallets"
      ON public.user_wallets
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_user_wallets_updated_at'
  ) THEN
    CREATE TRIGGER update_user_wallets_updated_at
      BEFORE UPDATE ON public.user_wallets
      FOR EACH ROW
      EXECUTE FUNCTION public.update_user_wallets_updated_at();
  END IF;
END $$;

-- Function to get or create user wallet
CREATE OR REPLACE FUNCTION public.get_or_create_user_wallet(p_user_id UUID)
RETURNS public.user_wallets AS $$
DECLARE
  v_wallet public.user_wallets;
BEGIN
  SELECT * INTO v_wallet
  FROM public.user_wallets
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.user_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_wallet;
  END IF;
  
  RETURN v_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON TABLE public.user_wallets IS 'Unified user wallet table containing all balances (NGN and crypto)';
