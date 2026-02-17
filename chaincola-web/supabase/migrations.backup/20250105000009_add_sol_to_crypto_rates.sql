-- Add SOL to crypto_rates table constraint
-- This migration updates the constraint to include SOL (Solana)

-- Drop the old constraint
ALTER TABLE public.crypto_rates 
DROP CONSTRAINT IF EXISTS chk_valid_symbol;

-- Add new constraint with SOL included
ALTER TABLE public.crypto_rates 
ADD CONSTRAINT chk_valid_symbol 
CHECK (crypto_symbol IN ('BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP', 'SOL'));

-- Update the set_crypto_rate function to accept SOL
CREATE OR REPLACE FUNCTION public.set_crypto_rate(
  p_admin_user_id UUID,
  p_crypto_symbol TEXT,
  p_price_usd DECIMAL,
  p_price_ngn DECIMAL,
  p_bid DECIMAL DEFAULT NULL,
  p_ask DECIMAL DEFAULT NULL,
  p_volume_24h DECIMAL DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rate_id UUID;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can set crypto rates';
  END IF;

  -- Validate symbol (now includes SOL)
  IF p_crypto_symbol NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'TRX', 'XRP', 'SOL') THEN
    RAISE EXCEPTION 'Invalid crypto symbol: %. Supported: BTC, ETH, USDT, USDC, TRX, XRP, SOL', p_crypto_symbol;
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







