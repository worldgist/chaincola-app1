-- Create crypto price alerts system
-- This migration creates tables for storing crypto prices and user price alerts

-- Table to store Expo push notification tokens (if not exists)
CREATE TABLE IF NOT EXISTS public.push_notification_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one token per user per platform
  UNIQUE(user_id, platform)
);

-- Create indexes for push_notification_tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id 
  ON public.push_notification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_token 
  ON public.push_notification_tokens(token);

-- Enable RLS for push_notification_tokens
ALTER TABLE public.push_notification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_notification_tokens
DROP POLICY IF EXISTS "Users can view own push tokens" ON public.push_notification_tokens;
CREATE POLICY "Users can view own push tokens"
  ON public.push_notification_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_notification_tokens;
CREATE POLICY "Users can insert own push tokens"
  ON public.push_notification_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_notification_tokens;
CREATE POLICY "Users can update own push tokens"
  ON public.push_notification_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_notification_tokens;
CREATE POLICY "Users can delete own push tokens"
  ON public.push_notification_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp for push_notification_tokens
CREATE OR REPLACE FUNCTION update_push_token_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at for push_notification_tokens
DROP TRIGGER IF EXISTS update_push_token_updated_at ON public.push_notification_tokens;
CREATE TRIGGER update_push_token_updated_at
  BEFORE UPDATE ON public.push_notification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_updated_at();

-- Table to store latest crypto prices for comparison
CREATE TABLE IF NOT EXISTS public.crypto_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crypto_symbol TEXT NOT NULL CHECK (crypto_symbol IN ('BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'XRP', 'BUSD', 'DAI')),
  price_usd DECIMAL(20, 8) NOT NULL,
  price_ngn DECIMAL(20, 8) NOT NULL,
  source TEXT NOT NULL DEFAULT 'Alchemy', -- 'Alchemy', 'CoinGecko', etc.
  last_updated TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one price record per crypto symbol
  UNIQUE(crypto_symbol)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crypto_prices_symbol ON public.crypto_prices(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_prices_last_updated ON public.crypto_prices(last_updated DESC);

-- Table to store user price alerts
CREATE TABLE IF NOT EXISTS public.user_price_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_symbol TEXT NOT NULL CHECK (crypto_symbol IN ('BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'XRP', 'BUSD', 'DAI')),
  
  -- Alert type: 'PERCENTAGE_MOVE' or 'TARGET_PRICE'
  alert_type TEXT NOT NULL CHECK (alert_type IN ('PERCENTAGE_MOVE', 'TARGET_PRICE')),
  
  -- For PERCENTAGE_MOVE: percentage change threshold (e.g., 3.0 for 3%)
  percentage_threshold DECIMAL(5, 2),
  
  -- For TARGET_PRICE: target price in USD
  target_price_usd DECIMAL(20, 8),
  
  -- Direction: 'ABOVE' or 'BELOW' (for target price alerts)
  direction TEXT CHECK (direction IN ('ABOVE', 'BELOW')),
  
  -- Alert settings
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  notify_on_up BOOLEAN DEFAULT true NOT NULL, -- For percentage move alerts
  notify_on_down BOOLEAN DEFAULT true NOT NULL, -- For percentage move alerts
  
  -- Last triggered timestamp (to prevent spam)
  last_triggered_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT valid_percentage_alert CHECK (
    (alert_type = 'PERCENTAGE_MOVE' AND percentage_threshold IS NOT NULL) OR
    (alert_type = 'TARGET_PRICE' AND target_price_usd IS NOT NULL AND direction IS NOT NULL)
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_user_id ON public.user_price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_crypto_symbol ON public.user_price_alerts(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_enabled ON public.user_price_alerts(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_type ON public.user_price_alerts(alert_type);

-- Enable RLS
ALTER TABLE public.crypto_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_price_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crypto_prices
-- Everyone can read crypto prices (public data)
DROP POLICY IF EXISTS "Anyone can view crypto prices" ON public.crypto_prices;
CREATE POLICY "Anyone can view crypto prices"
  ON public.crypto_prices
  FOR SELECT
  USING (true);

-- Only service role can insert/update crypto prices
DROP POLICY IF EXISTS "Service role can manage crypto prices" ON public.crypto_prices;
CREATE POLICY "Service role can manage crypto prices"
  ON public.crypto_prices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for user_price_alerts
-- Users can view their own alerts
DROP POLICY IF EXISTS "Users can view own price alerts" ON public.user_price_alerts;
CREATE POLICY "Users can view own price alerts"
  ON public.user_price_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own alerts
DROP POLICY IF EXISTS "Users can insert own price alerts" ON public.user_price_alerts;
CREATE POLICY "Users can insert own price alerts"
  ON public.user_price_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own alerts
DROP POLICY IF EXISTS "Users can update own price alerts" ON public.user_price_alerts;
CREATE POLICY "Users can update own price alerts"
  ON public.user_price_alerts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own alerts
DROP POLICY IF EXISTS "Users can delete own price alerts" ON public.user_price_alerts;
CREATE POLICY "Users can delete own price alerts"
  ON public.user_price_alerts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_price_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_price_alerts_updated_at ON public.user_price_alerts;
CREATE TRIGGER update_user_price_alerts_updated_at
  BEFORE UPDATE ON public.user_price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_price_alerts_updated_at();

-- Function to get or create crypto price record
CREATE OR REPLACE FUNCTION get_or_create_crypto_price(
  p_crypto_symbol TEXT,
  p_price_usd DECIMAL,
  p_price_ngn DECIMAL,
  p_source TEXT DEFAULT 'Alchemy'
)
RETURNS UUID AS $$
DECLARE
  v_price_id UUID;
BEGIN
  INSERT INTO public.crypto_prices (
    crypto_symbol,
    price_usd,
    price_ngn,
    source,
    last_updated
  )
  VALUES (
    p_crypto_symbol,
    p_price_usd,
    p_price_ngn,
    p_source,
    NOW()
  )
  ON CONFLICT (crypto_symbol) 
  DO UPDATE SET
    price_usd = p_price_usd,
    price_ngn = p_price_ngn,
    source = p_source,
    last_updated = NOW()
  RETURNING id INTO v_price_id;
  
  RETURN v_price_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_crypto_price(TEXT, DECIMAL, DECIMAL, TEXT) TO service_role, authenticated;

-- Comments
COMMENT ON TABLE public.crypto_prices IS 'Stores latest crypto prices for comparison and alert checking';
COMMENT ON TABLE public.user_price_alerts IS 'Stores user-defined price alerts for crypto assets';
COMMENT ON COLUMN public.user_price_alerts.alert_type IS 'Type of alert: PERCENTAGE_MOVE (3% change) or TARGET_PRICE (reaches specific price)';
COMMENT ON COLUMN public.user_price_alerts.percentage_threshold IS 'Percentage change threshold for PERCENTAGE_MOVE alerts (e.g., 3.0 for 3%)';
COMMENT ON COLUMN public.user_price_alerts.target_price_usd IS 'Target price in USD for TARGET_PRICE alerts';
COMMENT ON COLUMN public.user_price_alerts.direction IS 'Direction for TARGET_PRICE alerts: ABOVE or BELOW';
COMMENT ON COLUMN public.user_price_alerts.last_triggered_at IS 'Last time this alert was triggered (to prevent spam)';