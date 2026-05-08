-- Auto-Sell Crypto Feature
-- Enables automatic conversion of received cryptocurrency to NGN

-- User preferences table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_sell_crypto BOOLEAN DEFAULT true, -- Enable auto-sell by default
  auto_sell_btc BOOLEAN DEFAULT true,
  auto_sell_eth BOOLEAN DEFAULT true,
  auto_sell_sol BOOLEAN DEFAULT true,
  auto_sell_xrp BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Auto-sell logs table to track all auto-conversions
CREATE TABLE IF NOT EXISTS auto_sell_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_currency TEXT NOT NULL, -- BTC, ETH, SOL, XRP
  crypto_amount NUMERIC(20, 10) NOT NULL,
  ngn_amount NUMERIC(20, 2) NOT NULL,
  source_transaction_id UUID REFERENCES public.transactions(id), -- Original deposit transaction
  sell_id UUID REFERENCES public.sells(sell_id), -- Sell transaction record
  status TEXT NOT NULL DEFAULT 'SUCCESS', -- SUCCESS, FAILED, PENDING
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for auto_sell_logs
CREATE INDEX IF NOT EXISTS idx_auto_sell_logs_user_id ON auto_sell_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_sell_logs_crypto ON auto_sell_logs(crypto_currency);
CREATE INDEX IF NOT EXISTS idx_auto_sell_logs_source_tx ON auto_sell_logs(source_transaction_id);
CREATE INDEX IF NOT EXISTS idx_auto_sell_logs_created_at ON auto_sell_logs(created_at DESC);

-- Add auto_sell flag to transactions table (to mark auto-converted deposits)
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS auto_sold BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sell_id UUID REFERENCES auto_sell_logs(id);

-- Add auto_sell flag to sells table (to mark automated sells)
ALTER TABLE sells 
  ADD COLUMN IF NOT EXISTS auto_sell BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_deposit_id UUID REFERENCES transactions(id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_preferences
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for auto_sell_logs
ALTER TABLE auto_sell_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own auto-sell logs"
  ON auto_sell_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can view all logs
CREATE POLICY "Admins can view all auto-sell logs"
  ON auto_sell_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Service role can insert logs
CREATE POLICY "Service can insert auto-sell logs"
  ON auto_sell_logs FOR INSERT
  WITH CHECK (true);

-- Service role can update logs
CREATE POLICY "Service can update auto-sell logs"
  ON auto_sell_logs FOR UPDATE
  USING (true);

-- Create a view for auto-sell statistics
CREATE OR REPLACE VIEW auto_sell_stats AS
SELECT
  user_id,
  crypto_currency,
  COUNT(*) as total_conversions,
  SUM(crypto_amount) as total_crypto_amount,
  SUM(ngn_amount) as total_ngn_amount,
  AVG(ngn_amount / NULLIF(crypto_amount, 0)) as avg_rate,
  MAX(executed_at) as last_conversion_at
FROM auto_sell_logs
WHERE status = 'SUCCESS'
GROUP BY user_id, crypto_currency;

-- Grant access to the view
GRANT SELECT ON auto_sell_stats TO authenticated;
GRANT SELECT ON auto_sell_stats TO service_role;

-- Comment on tables
COMMENT ON TABLE user_preferences IS 'User preferences including auto-sell settings';
COMMENT ON TABLE auto_sell_logs IS 'Log of all automatic crypto to NGN conversions';
COMMENT ON COLUMN user_preferences.auto_sell_crypto IS 'Master toggle for auto-sell feature';
COMMENT ON COLUMN auto_sell_logs.source_transaction_id IS 'Original deposit transaction that triggered the auto-sell';
