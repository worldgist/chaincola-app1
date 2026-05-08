-- Seed/update pricing engine with canonical per-asset configuration used by admin UI reference.
-- Values are NGN per 1 full coin and aligned with PRICING_ASSET_REFERENCE.

INSERT INTO public.pricing_engine_config (
  asset,
  buy_spread_percentage,
  sell_spread_percentage,
  retail_markup_fraction,
  override_buy_price_ngn,
  override_sell_price_ngn,
  trading_enabled,
  price_frozen,
  notes,
  updated_at
)
VALUES
  ('BTC',  0.01, 0.01, 0.052, 70000000, 66539924, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('ETH',  0.01, 0.01, 0.052,  4000000,  3802281, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('USDT', 0.01, 0.01, 0.003,     1650,     1645, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('USDC', 0.01, 0.01, 0.003,     1650,     1645, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('XRP',  0.01, 0.01, 0.052,     1000,      951, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('SOL',  0.01, 0.01, 0.052,   250000,   237643, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW()),
  ('TRX',  0.01, 0.01, 0.052,      250,      238, true, false, 'Canonical admin asset config seed (2026-05-07)', NOW())
ON CONFLICT (asset) DO UPDATE
SET
  buy_spread_percentage = EXCLUDED.buy_spread_percentage,
  sell_spread_percentage = EXCLUDED.sell_spread_percentage,
  retail_markup_fraction = EXCLUDED.retail_markup_fraction,
  override_buy_price_ngn = EXCLUDED.override_buy_price_ngn,
  override_sell_price_ngn = EXCLUDED.override_sell_price_ngn,
  trading_enabled = EXCLUDED.trading_enabled,
  price_frozen = EXCLUDED.price_frozen,
  notes = EXCLUDED.notes,
  updated_at = NOW();
