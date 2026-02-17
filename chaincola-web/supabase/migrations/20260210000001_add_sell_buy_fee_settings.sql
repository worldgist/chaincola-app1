-- Document platform fee for buy/sell crypto
-- transaction_fee_percentage in app_settings: 1 = 1%, used by instant-buy-crypto and instant-sell-crypto-v2
-- Admin sets this in Admin Settings. Edge functions use it; if 0 or not set, default 1% is used.

COMMENT ON COLUMN public.app_settings.transaction_fee_percentage IS 'Platform fee % for buy/sell (1=1%). Used by instant-buy-crypto and instant-sell-crypto-v2. Set via Admin Settings.';
