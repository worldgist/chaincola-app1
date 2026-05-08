-- Per-asset retail spread (buy/holdings vs sell quote) + expose legacy market-spread columns in admin RPCs.

ALTER TABLE public.pricing_engine_config
  ADD COLUMN IF NOT EXISTS retail_markup_fraction DECIMAL(8, 6) NOT NULL DEFAULT 0.052;

ALTER TABLE public.pricing_engine_config
  DROP CONSTRAINT IF EXISTS pricing_engine_config_retail_markup_frac_chk;

ALTER TABLE public.pricing_engine_config
  ADD CONSTRAINT pricing_engine_config_retail_markup_frac_chk
  CHECK (retail_markup_fraction >= 0 AND retail_markup_fraction <= 0.500000);

COMMENT ON COLUMN public.pricing_engine_config.retail_markup_fraction IS
  'Buy_quote = sell_quote * (1 + fraction). Example 0.052 = 5.2% gap between sell and displayed buy/holdings. Use ~0.003 for pegged stablecoins.';
COMMENT ON COLUMN public.pricing_engine_config.buy_spread_percentage IS
  'Reserved: intended as extra markup vs mid when deriving from market (fraction, e.g. 0.01 = 1%).';
COMMENT ON COLUMN public.pricing_engine_config.sell_spread_percentage IS
  'Reserved: markdown vs mid when deriving from market (fraction, e.g. 0.01 = 1%).';

UPDATE public.pricing_engine_config pec
SET retail_markup_fraction = 0.003
WHERE pec.asset IN ('USDT', 'USDC');

-- Extend set_config (drops old signature, adds p_retail_markup_fraction as last nullable param before admin id semantics preserved)
DROP FUNCTION IF EXISTS public.set_pricing_engine_config(TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, BOOLEAN, BOOLEAN, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.set_pricing_engine_config(
  p_asset TEXT,
  p_buy_spread_percentage DECIMAL DEFAULT NULL,
  p_sell_spread_percentage DECIMAL DEFAULT NULL,
  p_override_buy_price_ngn DECIMAL DEFAULT NULL,
  p_override_sell_price_ngn DECIMAL DEFAULT NULL,
  p_trading_enabled BOOLEAN DEFAULT NULL,
  p_price_frozen BOOLEAN DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_retail_markup_fraction DECIMAL DEFAULT NULL,
  p_admin_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
  v_current_buy_price DECIMAL(20, 8);
  v_current_sell_price DECIMAL(20, 8);
BEGIN
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can set pricing engine config';
  END IF;

  IF p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'TRX') THEN
    RAISE EXCEPTION 'Invalid asset: %. Supported: BTC, ETH, USDT, USDC, XRP, SOL, TRX', p_asset;
  END IF;

  IF p_price_frozen = true THEN
    SELECT override_buy_price_ngn, override_sell_price_ngn INTO v_current_buy_price, v_current_sell_price
    FROM public.pricing_engine_config
    WHERE asset = p_asset;

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
    retail_markup_fraction,
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
    COALESCE(
      p_retail_markup_fraction,
      CASE WHEN p_asset IN ('USDT', 'USDC') THEN 0.003 ELSE 0.052 END
    ),
    p_admin_user_id,
    p_admin_user_id
  )
  ON CONFLICT (asset) DO UPDATE
  SET
    buy_spread_percentage = COALESCE(p_buy_spread_percentage, pricing_engine_config.buy_spread_percentage),
    sell_spread_percentage = COALESCE(p_sell_spread_percentage, pricing_engine_config.sell_spread_percentage),
    override_buy_price_ngn = EXCLUDED.override_buy_price_ngn,
    override_sell_price_ngn = EXCLUDED.override_sell_price_ngn,
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
    retail_markup_fraction = COALESCE(p_retail_markup_fraction, pricing_engine_config.retail_markup_fraction),
    updated_by = p_admin_user_id,
    updated_at = NOW()
  RETURNING id INTO v_config_id;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.get_all_pricing_engine_configs();
CREATE OR REPLACE FUNCTION public.get_all_pricing_engine_configs()
RETURNS TABLE (
  id UUID,
  asset TEXT,
  buy_spread_percentage DECIMAL,
  sell_spread_percentage DECIMAL,
  retail_markup_fraction DECIMAL,
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
  IF NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can view pricing engine configs';
  END IF;

  RETURN QUERY
  SELECT
    pec.id,
    pec.asset,
    pec.buy_spread_percentage,
    pec.sell_spread_percentage,
    pec.retail_markup_fraction,
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

DROP FUNCTION IF EXISTS public.get_pricing_engine_config(TEXT);
CREATE OR REPLACE FUNCTION public.get_pricing_engine_config(p_asset TEXT)
RETURNS TABLE (
  id UUID,
  asset TEXT,
  buy_spread_percentage DECIMAL,
  sell_spread_percentage DECIMAL,
  retail_markup_fraction DECIMAL,
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
    pec.retail_markup_fraction,
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

GRANT EXECUTE ON FUNCTION public.set_pricing_engine_config(TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, BOOLEAN, BOOLEAN, TEXT, DECIMAL, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_all_pricing_engine_configs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pricing_engine_config(TEXT) TO authenticated, service_role;
