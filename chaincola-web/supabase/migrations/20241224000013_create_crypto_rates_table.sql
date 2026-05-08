-- Create crypto_rates table for admin-managed cryptocurrency rates
-- This allows admins to set custom rates that override Luno API rates

CREATE TABLE IF NOT EXISTS public.crypto_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crypto_symbol TEXT NOT NULL UNIQUE, -- BTC, ETH, USDT, USDC, TRX, XRP
  price_usd DECIMAL(20, 8) NOT NULL,
  price_ngn DECIMAL(20, 8) NOT NULL,
  bid DECIMAL(20, 8), -- Optional bid price
  ask DECIMAL(20, 8), -- Optional ask price
  volume_24h DECIMAL(20, 8), -- Optional 24h volume
  is_active BOOLEAN DEFAULT true NOT NULL, -- Whether this rate is active
  notes TEXT, -- Admin notes about the rate
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_positive_prices CHECK (price_usd > 0 AND price_ngn > 0),
  CONSTRAINT chk_valid_symbol CHECK (crypto_symbol IN ('BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crypto_rates_symbol ON public.crypto_rates(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_rates_active ON public.crypto_rates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crypto_rates_updated_at ON public.crypto_rates(updated_at DESC);

-- Enable RLS
ALTER TABLE public.crypto_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crypto_rates
-- Everyone can view active rates (for price display)
CREATE POLICY "Anyone can view active crypto rates"
  ON public.crypto_rates
  FOR SELECT
  USING (is_active = true);

-- Admins can view all rates (including inactive)
CREATE POLICY "Admins can view all crypto rates"
  ON public.crypto_rates
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can insert rates
CREATE POLICY "Admins can insert crypto rates"
  ON public.crypto_rates
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can update rates
CREATE POLICY "Admins can update crypto rates"
  ON public.crypto_rates
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can delete rates
CREATE POLICY "Admins can delete crypto rates"
  ON public.crypto_rates
  FOR DELETE
  USING (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_crypto_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on rate update
CREATE TRIGGER update_crypto_rates_updated_at
  BEFORE UPDATE ON public.crypto_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crypto_rates_updated_at();

-- Function to set or update crypto rate (admin only)
CREATE OR REPLACE FUNCTION public.set_crypto_rate(
  p_crypto_symbol TEXT,
  p_price_usd DECIMAL,
  p_price_ngn DECIMAL,
  p_admin_user_id UUID,
  p_bid DECIMAL DEFAULT NULL,
  p_ask DECIMAL DEFAULT NULL,
  p_volume_24h DECIMAL DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
  v_rate_id UUID;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can set crypto rates';
  END IF;

  -- Validate symbol
  IF p_crypto_symbol NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP') THEN
    RAISE EXCEPTION 'Invalid crypto symbol: %. Supported: BTC, ETH, USDT, USDC, TRX, XRP', p_crypto_symbol;
  END IF;

  -- Validate prices
  IF p_price_usd <= 0 OR p_price_ngn <= 0 THEN
    RAISE EXCEPTION 'Prices must be greater than 0';
  END IF;

  -- Insert or update rate
  INSERT INTO public.crypto_rates (
    crypto_symbol,
    price_usd,
    price_ngn,
    bid,
    ask,
    volume_24h,
    is_active,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_crypto_symbol,
    p_price_usd,
    p_price_ngn,
    p_bid,
    p_ask,
    p_volume_24h,
    p_is_active,
    p_notes,
    p_admin_user_id,
    p_admin_user_id
  )
  ON CONFLICT (crypto_symbol) DO UPDATE
  SET
    price_usd = EXCLUDED.price_usd,
    price_ngn = EXCLUDED.price_ngn,
    bid = COALESCE(EXCLUDED.bid, crypto_rates.bid),
    ask = COALESCE(EXCLUDED.ask, crypto_rates.ask),
    volume_24h = COALESCE(EXCLUDED.volume_24h, crypto_rates.volume_24h),
    is_active = EXCLUDED.is_active,
    notes = COALESCE(EXCLUDED.notes, crypto_rates.notes),
    updated_by = p_admin_user_id,
    updated_at = NOW()
  RETURNING id INTO v_rate_id;

  RETURN v_rate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all crypto rates (for admin)
CREATE OR REPLACE FUNCTION public.get_all_crypto_rates()
RETURNS TABLE (
  id UUID,
  crypto_symbol TEXT,
  price_usd DECIMAL,
  price_ngn DECIMAL,
  bid DECIMAL,
  ask DECIMAL,
  volume_24h DECIMAL,
  is_active BOOLEAN,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can view all crypto rates';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.crypto_symbol,
    cr.price_usd,
    cr.price_ngn,
    cr.bid,
    cr.ask,
    cr.volume_24h,
    cr.is_active,
    cr.notes,
    cr.created_by,
    cr.updated_by,
    cr.created_at,
    cr.updated_at
  FROM public.crypto_rates cr
  ORDER BY cr.crypto_symbol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active crypto rate by symbol (public, for price display)
CREATE OR REPLACE FUNCTION public.get_active_crypto_rate(p_crypto_symbol TEXT)
RETURNS TABLE (
  id UUID,
  crypto_symbol TEXT,
  price_usd DECIMAL,
  price_ngn DECIMAL,
  bid DECIMAL,
  ask DECIMAL,
  volume_24h DECIMAL,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.crypto_symbol,
    cr.price_usd,
    cr.price_ngn,
    cr.bid,
    cr.ask,
    cr.volume_24h,
    cr.updated_at
  FROM public.crypto_rates cr
  WHERE cr.crypto_symbol = p_crypto_symbol
    AND cr.is_active = true
  ORDER BY cr.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle crypto rate active status (admin only)
CREATE OR REPLACE FUNCTION public.toggle_crypto_rate_status(
  p_crypto_symbol TEXT,
  p_admin_user_id UUID,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can toggle crypto rate status';
  END IF;

  UPDATE public.crypto_rates
  SET
    is_active = p_is_active,
    updated_by = p_admin_user_id,
    updated_at = NOW()
  WHERE crypto_symbol = p_crypto_symbol;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crypto rate not found for symbol: %', p_crypto_symbol;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_crypto_rate(TEXT, DECIMAL, DECIMAL, UUID, DECIMAL, DECIMAL, DECIMAL, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_crypto_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_crypto_rate(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_crypto_rate_status(TEXT, UUID, BOOLEAN) TO authenticated;

-- Add comments
COMMENT ON TABLE public.crypto_rates IS 'Admin-managed cryptocurrency rates that override Luno API rates';
COMMENT ON COLUMN public.crypto_rates.crypto_symbol IS 'Cryptocurrency symbol (BTC, ETH, USDT, USDC, TRX, XRP)';
COMMENT ON COLUMN public.crypto_rates.price_usd IS 'Price in USD';
COMMENT ON COLUMN public.crypto_rates.price_ngn IS 'Price in NGN';
COMMENT ON COLUMN public.crypto_rates.is_active IS 'Whether this rate is active and should override API rates';
COMMENT ON FUNCTION public.set_crypto_rate IS 'Set or update a crypto rate (admin only)';
COMMENT ON FUNCTION public.get_all_crypto_rates IS 'Get all crypto rates including inactive ones (admin only)';
COMMENT ON FUNCTION public.get_active_crypto_rate IS 'Get active crypto rate by symbol (public)';
COMMENT ON FUNCTION public.toggle_crypto_rate_status IS 'Toggle crypto rate active status (admin only)';
















