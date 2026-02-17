-- Add buy_rate_ngn field to crypto_rates table
-- This field stores the NGN rate specifically for buying crypto
-- It's separate from price_ngn to allow different buy/sell rates

-- Add buy_rate_ngn column
ALTER TABLE public.crypto_rates
ADD COLUMN IF NOT EXISTS buy_rate_ngn DECIMAL(20, 8);

-- Add comment
COMMENT ON COLUMN public.crypto_rates.buy_rate_ngn IS 'NGN rate specifically for buying crypto (NGN per unit of crypto). If NULL, price_ngn will be used.';

-- Drop all overloads of set_crypto_rate function before recreating with new parameter
-- Use a DO block to drop all overloads dynamically
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Find and drop all overloads of set_crypto_rate
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'set_crypto_rate' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- Update set_crypto_rate function to support buy_rate_ngn
CREATE OR REPLACE FUNCTION public.set_crypto_rate(
  p_crypto_symbol TEXT,
  p_price_usd DECIMAL,
  p_price_ngn DECIMAL,
  p_admin_user_id UUID,
  p_bid DECIMAL DEFAULT NULL,
  p_ask DECIMAL DEFAULT NULL,
  p_volume_24h DECIMAL DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true,
  p_buy_rate_ngn DECIMAL DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rate_id UUID;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can set crypto rates';
  END IF;

  -- Validate symbol (includes BTC, ETH, USDT, USDC, TRX, XRP, SOL)
  IF p_crypto_symbol NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP', 'SOL') THEN
    RAISE EXCEPTION 'Invalid crypto symbol: %. Supported: BTC, ETH, USDT, USDC, TRX, XRP, SOL', p_crypto_symbol;
  END IF;

  -- Validate prices
  IF p_price_usd <= 0 OR p_price_ngn <= 0 THEN
    RAISE EXCEPTION 'Prices must be greater than 0';
  END IF;

  -- Validate buy_rate_ngn if provided
  IF p_buy_rate_ngn IS NOT NULL AND p_buy_rate_ngn <= 0 THEN
    RAISE EXCEPTION 'Buy rate (NGN) must be greater than 0 if provided';
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
    buy_rate_ngn,
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
    p_buy_rate_ngn,
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
    buy_rate_ngn = COALESCE(EXCLUDED.buy_rate_ngn, crypto_rates.buy_rate_ngn),
    updated_by = p_admin_user_id,
    updated_at = NOW()
  RETURNING id INTO v_rate_id;

  RETURN v_rate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop get_all_crypto_rates function before recreating with new return type
-- Use a DO block to drop all overloads dynamically
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Find and drop all overloads of get_all_crypto_rates
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'get_all_crypto_rates' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- Update get_all_crypto_rates function to include buy_rate_ngn
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
  buy_rate_ngn DECIMAL,
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
    cr.buy_rate_ngn,
    cr.created_by,
    cr.updated_by,
    cr.created_at,
    cr.updated_at
  FROM public.crypto_rates cr
  ORDER BY cr.crypto_symbol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop get_active_crypto_rate function before recreating with new return type
-- Use a DO block to drop all overloads dynamically
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Find and drop all overloads of get_active_crypto_rate
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'get_active_crypto_rate' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- Update get_active_crypto_rate function to include buy_rate_ngn
CREATE OR REPLACE FUNCTION public.get_active_crypto_rate(p_crypto_symbol TEXT)
RETURNS TABLE (
  id UUID,
  crypto_symbol TEXT,
  price_usd DECIMAL,
  price_ngn DECIMAL,
  bid DECIMAL,
  ask DECIMAL,
  volume_24h DECIMAL,
  buy_rate_ngn DECIMAL,
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
    cr.buy_rate_ngn,
    cr.updated_at
  FROM public.crypto_rates cr
  WHERE cr.crypto_symbol = p_crypto_symbol
    AND cr.is_active = true
  ORDER BY cr.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_crypto_rate(TEXT, DECIMAL, DECIMAL, UUID, DECIMAL, DECIMAL, DECIMAL, TEXT, BOOLEAN, DECIMAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_crypto_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_crypto_rate(TEXT) TO authenticated;

-- Update comments (using full signatures to avoid ambiguity)
COMMENT ON FUNCTION public.set_crypto_rate(TEXT, DECIMAL, DECIMAL, UUID, DECIMAL, DECIMAL, DECIMAL, TEXT, BOOLEAN, DECIMAL) IS 'Set or update a crypto rate (admin only). Supports BTC, ETH, USDT, USDC, TRX, XRP, SOL. buy_rate_ngn is the NGN rate specifically for buying crypto.';
COMMENT ON FUNCTION public.get_all_crypto_rates() IS 'Get all crypto rates including inactive ones (admin only). Now includes buy_rate_ngn field.';
COMMENT ON FUNCTION public.get_active_crypto_rate(TEXT) IS 'Get active crypto rate by symbol (public). Now includes buy_rate_ngn field.';
