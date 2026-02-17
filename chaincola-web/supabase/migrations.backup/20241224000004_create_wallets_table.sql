-- Create wallets table for storing user fiat currency balances (NGN, USD, etc.)

CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ngn_balance DECIMAL(20, 2) DEFAULT 0.00 NOT NULL,
  usd_balance DECIMAL(20, 2) DEFAULT 0.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT positive_ngn_balance CHECK (ngn_balance >= 0),
  CONSTRAINT positive_usd_balance CHECK (usd_balance >= 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallets
-- Users can view their own wallet
CREATE POLICY "Users can view own wallet"
  ON public.wallets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all wallets
CREATE POLICY "Admins can view all wallets"
  ON public.wallets
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can insert their own wallet
CREATE POLICY "Users can insert own wallet"
  ON public.wallets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own wallet
CREATE POLICY "Users can update own wallet"
  ON public.wallets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all wallets
CREATE POLICY "Admins can update all wallets"
  ON public.wallets
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on wallet update
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallets_updated_at();

-- Function to credit wallet (used by payment webhooks)
-- Works with both wallets and wallet_balances tables
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id UUID,
  p_amount DECIMAL(20, 2),
  p_currency TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate currency
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency;
  END IF;

  -- Update wallets table (if exists)
  INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
  VALUES (
    p_user_id,
    CASE WHEN p_currency = 'NGN' THEN p_amount ELSE 0 END,
    CASE WHEN p_currency = 'USD' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    ngn_balance = CASE 
      WHEN p_currency = 'NGN' THEN wallets.ngn_balance + p_amount
      ELSE wallets.ngn_balance
    END,
    usd_balance = CASE 
      WHEN p_currency = 'USD' THEN wallets.usd_balance + p_amount
      ELSE wallets.usd_balance
    END,
    updated_at = NOW();

  -- Also update wallet_balances table (if exists)
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, p_currency, p_amount)
  ON CONFLICT (user_id, currency) DO UPDATE
  SET
    balance = wallet_balances.balance + p_amount,
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, continue
    RETURN TRUE;
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE public.wallets IS 'Stores user fiat currency wallet balances';
COMMENT ON FUNCTION public.credit_wallet IS 'Credits a user wallet with the specified amount and currency';

