-- Create pricing_engine_config table for admin-managed pricing controls
-- Allows admins to control buy/sell spreads, override prices, enable/disable trading, and freeze prices

CREATE TABLE IF NOT EXISTS public.pricing_engine_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL UNIQUE, -- BTC, ETH, USDT, USDC, XRP, SOL, TRX
  -- Spread configuration (percentage)
  buy_spread_percentage DECIMAL(5, 4) DEFAULT 0.01 NOT NULL, -- 1% default buy spread
  sell_spread_percentage DECIMAL(5, 4) DEFAULT 0.01 NOT NULL, -- 1% default sell spread
  -- Price overrides (optional - if set, these override market prices)
  override_buy_price_ngn DECIMAL(20, 8), -- Override buy price in NGN
  override_sell_price_ngn DECIMAL(20, 8), -- Override sell price in NGN
  -- Trading controls
  trading_enabled BOOLEAN DEFAULT true NOT NULL, -- Enable/disable trading for this asset
  -- Global freeze control
  price_frozen BOOLEAN DEFAULT false NOT NULL, -- Freeze prices globally (use last known prices)
  frozen_buy_price_ngn DECIMAL(20, 8), -- Last buy price when frozen
  frozen_sell_price_ngn DECIMAL(20, 8), -- Last sell price when frozen
  frozen_at TIMESTAMPTZ, -- When prices were frozen
  -- Metadata
  notes TEXT, -- Admin notes
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_valid_asset CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX')),
  CONSTRAINT chk_positive_spreads CHECK (buy_spread_percentage >= 0 AND sell_spread_percentage >= 0),
  CONSTRAINT chk_positive_override_prices CHECK (
    (override_buy_price_ngn IS NULL OR override_buy_price_ngn > 0) AND
    (override_sell_price_ngn IS NULL OR override_sell_price_ngn > 0)
  ),
  CONSTRAINT chk_positive_frozen_prices CHECK (
    (frozen_buy_price_ngn IS NULL OR frozen_buy_price_ngn > 0) AND
    (frozen_sell_price_ngn IS NULL OR frozen_sell_price_ngn > 0)
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_engine_config_asset ON public.pricing_engine_config(asset);
CREATE INDEX IF NOT EXISTS idx_pricing_engine_config_trading_enabled ON public.pricing_engine_config(trading_enabled) WHERE trading_enabled = true;
CREATE INDEX IF NOT EXISTS idx_pricing_engine_config_price_frozen ON public.pricing_engine_config(price_frozen) WHERE price_frozen = true;

-- Enable RLS
ALTER TABLE public.pricing_engine_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can view all configs
CREATE POLICY "Admins can view pricing engine configs"
  ON public.pricing_engine_config
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can insert configs
CREATE POLICY "Admins can insert pricing engine configs"
  ON public.pricing_engine_config
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can update configs
CREATE POLICY "Admins can update pricing engine configs"
  ON public.pricing_engine_config
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Admins can delete configs
CREATE POLICY "Admins can delete pricing engine configs"
  ON public.pricing_engine_config
  FOR DELETE
  USING (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_pricing_engine_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_pricing_engine_config_updated_at
  BEFORE UPDATE ON public.pricing_engine_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pricing_engine_config_updated_at();

-- Function to set or update pricing engine config (admin only)
CREATE OR REPLACE FUNCTION public.set_pricing_engine_config(
  p_asset TEXT,
  p_buy_spread_percentage DECIMAL DEFAULT NULL,
  p_sell_spread_percentage DECIMAL DEFAULT NULL,
  p_override_buy_price_ngn DECIMAL DEFAULT NULL,
  p_override_sell_price_ngn DECIMAL DEFAULT NULL,
  p_trading_enabled BOOLEAN DEFAULT NULL,
  p_price_frozen BOOLEAN DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_admin_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
  v_current_buy_price DECIMAL(20, 8);
  v_current_sell_price DECIMAL(20, 8);
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can set pricing engine config';
  END IF;

  -- Validate asset
  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX') THEN
    RAISE EXCEPTION 'Invalid asset: %. Supported: BTC, ETH, USDT, USDC, XRP, SOL, TRX', p_asset;
  END IF;

  -- If freezing prices, capture current prices first
  IF p_price_frozen = true THEN
    SELECT override_buy_price_ngn, override_sell_price_ngn INTO v_current_buy_price, v_current_sell_price
    FROM public.pricing_engine_config
    WHERE asset = p_asset;
    
    -- If no override prices, we'll need to get from market (handled in application layer)
    -- For now, keep existing frozen prices if they exist
    IF v_current_buy_price IS NULL THEN
      SELECT frozen_buy_price_ngn INTO v_current_buy_price
      FROM public.pricing_engine_config
      WHERE asset = p_asset;
    END IF;
    
    IF v_current_sell_price IS NULL THEN
      SELECT frozen_sell_price_ngn INTO v_current_sell_price
      FROM public.pricing_engine_config
      WHERE asset = p_asset;
    END IF;
  END IF;

  -- Insert or update config
  INSERT INTO public.pricing_engine_config (
    asset,
    buy_spread_percentage,
    sell_spread_percentage,
    override_buy_price_ngn,
    override_sell_price_ngn,
    trading_enabled,
    price_frozen,
    frozen_buy_price_ngn,
    frozen_sell_price_ngn,
    frozen_at,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_asset,
    COALESCE(p_buy_spread_percentage, 0.01),
    COALESCE(p_sell_spread_percentage, 0.01),
    p_override_buy_price_ngn,
    p_override_sell_price_ngn,
    COALESCE(p_trading_enabled, true),
    COALESCE(p_price_frozen, false),
    CASE WHEN p_price_frozen = true AND v_current_buy_price IS NOT NULL THEN v_current_buy_price ELSE NULL END,
    CASE WHEN p_price_frozen = true AND v_current_sell_price IS NOT NULL THEN v_current_sell_price ELSE NULL END,
    CASE WHEN p_price_frozen = true THEN NOW() ELSE NULL END,
    p_notes,
    p_admin_user_id,
    p_admin_user_id
  )
  ON CONFLICT (asset) DO UPDATE
  SET
    buy_spread_percentage = COALESCE(EXCLUDED.buy_spread_percentage, pricing_engine_config.buy_spread_percentage),
    sell_spread_percentage = COALESCE(EXCLUDED.sell_spread_percentage, pricing_engine_config.sell_spread_percentage),
    override_buy_price_ngn = EXCLUDED.override_buy_price_ngn, -- Allow NULL to clear override
    override_sell_price_ngn = EXCLUDED.override_sell_price_ngn, -- Allow NULL to clear override
    trading_enabled = COALESCE(EXCLUDED.trading_enabled, pricing_engine_config.trading_enabled),
    price_frozen = COALESCE(EXCLUDED.price_frozen, pricing_engine_config.price_frozen),
    frozen_buy_price_ngn = CASE 
      WHEN EXCLUDED.price_frozen = true AND v_current_buy_price IS NOT NULL THEN v_current_buy_price
      WHEN EXCLUDED.price_frozen = false THEN NULL
      ELSE pricing_engine_config.frozen_buy_price_ngn
    END,
    frozen_sell_price_ngn = CASE 
      WHEN EXCLUDED.price_frozen = true AND v_current_sell_price IS NOT NULL THEN v_current_sell_price
      WHEN EXCLUDED.price_frozen = false THEN NULL
      ELSE pricing_engine_config.frozen_sell_price_ngn
    END,
    frozen_at = CASE 
      WHEN EXCLUDED.price_frozen = true THEN NOW()
      WHEN EXCLUDED.price_frozen = false THEN NULL
      ELSE pricing_engine_config.frozen_at
    END,
    notes = COALESCE(EXCLUDED.notes, pricing_engine_config.notes),
    updated_by = p_admin_user_id,
    updated_at = NOW()
  RETURNING id INTO v_config_id;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all pricing engine configs (admin only)
CREATE OR REPLACE FUNCTION public.get_all_pricing_engine_configs()
RETURNS TABLE (
  id UUID,
  asset TEXT,
  buy_spread_percentage DECIMAL,
  sell_spread_percentage DECIMAL,
  override_buy_price_ngn DECIMAL,
  override_sell_price_ngn DECIMAL,
  trading_enabled BOOLEAN,
  price_frozen BOOLEAN,
  frozen_buy_price_ngn DECIMAL,
  frozen_sell_price_ngn DECIMAL,
  frozen_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can view pricing engine configs';
  END IF;

  RETURN QUERY
  SELECT
    pec.id,
    pec.asset,
    pec.buy_spread_percentage,
    pec.sell_spread_percentage,
    pec.override_buy_price_ngn,
    pec.override_sell_price_ngn,
    pec.trading_enabled,
    pec.price_frozen,
    pec.frozen_buy_price_ngn,
    pec.frozen_sell_price_ngn,
    pec.frozen_at,
    pec.notes,
    pec.created_by,
    pec.updated_by,
    pec.created_at,
    pec.updated_at
  FROM public.pricing_engine_config pec
  ORDER BY pec.asset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pricing engine config by asset (for application use)
CREATE OR REPLACE FUNCTION public.get_pricing_engine_config(p_asset TEXT)
RETURNS TABLE (
  id UUID,
  asset TEXT,
  buy_spread_percentage DECIMAL,
  sell_spread_percentage DECIMAL,
  override_buy_price_ngn DECIMAL,
  override_sell_price_ngn DECIMAL,
  trading_enabled BOOLEAN,
  price_frozen BOOLEAN,
  frozen_buy_price_ngn DECIMAL,
  frozen_sell_price_ngn DECIMAL,
  frozen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pec.id,
    pec.asset,
    pec.buy_spread_percentage,
    pec.sell_spread_percentage,
    pec.override_buy_price_ngn,
    pec.override_sell_price_ngn,
    pec.trading_enabled,
    pec.price_frozen,
    pec.frozen_buy_price_ngn,
    pec.frozen_sell_price_ngn,
    pec.frozen_at
  FROM public.pricing_engine_config pec
  WHERE pec.asset = p_asset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to freeze/unfreeze prices globally
CREATE OR REPLACE FUNCTION public.freeze_pricing_globally(
  p_freeze BOOLEAN,
  p_admin_user_id UUID DEFAULT auth.uid()
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can freeze/unfreeze prices globally';
  END IF;

  -- Update all configs
  UPDATE public.pricing_engine_config
  SET
    price_frozen = p_freeze,
    frozen_at = CASE WHEN p_freeze = true THEN NOW() ELSE NULL END,
    updated_by = p_admin_user_id,
    updated_at = NOW()
  WHERE price_frozen != p_freeze; -- Only update if state is changing

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_pricing_engine_config(TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, BOOLEAN, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_pricing_engine_configs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pricing_engine_config(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.freeze_pricing_globally(BOOLEAN, UUID) TO authenticated, service_role;

-- Add comments
COMMENT ON TABLE public.pricing_engine_config IS 'Admin-managed pricing engine configuration for controlling buy/sell spreads, price overrides, trading enablement, and price freezing';
COMMENT ON COLUMN public.pricing_engine_config.buy_spread_percentage IS 'Buy spread percentage (e.g., 0.01 = 1%) applied to market price';
COMMENT ON COLUMN public.pricing_engine_config.sell_spread_percentage IS 'Sell spread percentage (e.g., 0.01 = 1%) applied to market price';
COMMENT ON COLUMN public.pricing_engine_config.override_buy_price_ngn IS 'Override buy price in NGN (if set, overrides market price + spread)';
COMMENT ON COLUMN public.pricing_engine_config.override_sell_price_ngn IS 'Override sell price in NGN (if set, overrides market price + spread)';
COMMENT ON COLUMN public.pricing_engine_config.trading_enabled IS 'Whether trading is enabled for this asset';
COMMENT ON COLUMN public.pricing_engine_config.price_frozen IS 'Whether prices are frozen (use frozen_buy_price_ngn/frozen_sell_price_ngn)';
COMMENT ON FUNCTION public.set_pricing_engine_config IS 'Set or update pricing engine configuration (admin only)';
COMMENT ON FUNCTION public.get_all_pricing_engine_configs IS 'Get all pricing engine configurations (admin only)';
COMMENT ON FUNCTION public.get_pricing_engine_config IS 'Get pricing engine configuration for a specific asset';
COMMENT ON FUNCTION public.freeze_pricing_globally IS 'Freeze or unfreeze prices globally for all assets (admin only)';
