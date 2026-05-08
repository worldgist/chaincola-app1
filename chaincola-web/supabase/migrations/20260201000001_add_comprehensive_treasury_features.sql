/*
 * Comprehensive Treasury Management Features
 * This migration adds: Price & Oracle Management, Threshold Rules, Liquidity Controls, Monitoring
 */

-- ============================================================================
-- 1. PRICE & ORACLE MANAGEMENT
-- ============================================================================

-- Price cache table for last-known prices
CREATE TABLE IF NOT EXISTS public.price_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL')),
  
  -- Price data
  price_usd DECIMAL(20, 8) NOT NULL,
  price_ngn DECIMAL(20, 2) NOT NULL,
  price_source TEXT NOT NULL DEFAULT 'COINGECKO', -- 'COINGECKO', 'LUNO', 'BINANCE', etc.
  
  -- Price metadata
  price_change_24h DECIMAL(10, 4), -- Percentage change
  volume_24h DECIMAL(20, 2),
  market_cap DECIMAL(20, 2),
  
  -- Fallback mechanism
  is_fallback BOOLEAN DEFAULT false NOT NULL,
  fallback_reason TEXT,
  
  -- Deviation tracking
  deviation_percentage DECIMAL(10, 4) DEFAULT 0, -- Deviation from previous price
  alert_threshold_percentage DECIMAL(5, 2) DEFAULT 5.0, -- Alert if deviation > 5%
  alert_sent BOOLEAN DEFAULT false,
  
  -- Timestamps
  fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one active price per asset
  UNIQUE(asset, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_price_cache_asset ON public.price_cache(asset);
CREATE INDEX IF NOT EXISTS idx_price_cache_fetched ON public.price_cache(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_cache_asset_latest ON public.price_cache(asset, fetched_at DESC);

-- Price sources configuration
CREATE TABLE IF NOT EXISTS public.price_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  source_name TEXT NOT NULL UNIQUE, -- 'COINGECKO', 'LUNO', 'BINANCE', etc.
  source_type TEXT NOT NULL CHECK (source_type IN ('API', 'EXCHANGE', 'ORACLE')),
  api_endpoint TEXT,
  api_key TEXT, -- Encrypted in production
  is_active BOOLEAN DEFAULT true NOT NULL,
  priority INTEGER DEFAULT 1, -- Lower number = higher priority
  reliability_score DECIMAL(3, 2) DEFAULT 1.0, -- 0.0 to 1.0
  
  -- Rate limiting
  requests_per_minute INTEGER DEFAULT 60,
  last_request_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default price sources
INSERT INTO public.price_sources (source_name, source_type, api_endpoint, priority, reliability_score)
VALUES 
  ('COINGECKO', 'API', 'https://api.coingecko.com/api/v3', 1, 0.95),
  ('LUNO', 'EXCHANGE', 'https://api.luno.com/api/1', 2, 0.90),
  ('BINANCE', 'EXCHANGE', 'https://api.binance.com/api/v3', 3, 0.85)
ON CONFLICT (source_name) DO NOTHING;

-- ============================================================================
-- 2. TREASURY THRESHOLD RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_threshold_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Asset information
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Thresholds
  minimum_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  critical_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL, -- Alert threshold
  optimal_balance DECIMAL(20, 8), -- Target balance
  
  -- Actions
  auto_disable_trading BOOLEAN DEFAULT false NOT NULL, -- Disable trading if below minimum
  alert_on_critical BOOLEAN DEFAULT true NOT NULL,
  alert_on_minimum BOOLEAN DEFAULT true NOT NULL,
  
  -- Alert configuration
  alert_channels TEXT[] DEFAULT ARRAY['EMAIL'], -- 'EMAIL', 'SLACK', 'SMS'
  alert_frequency_minutes INTEGER DEFAULT 60, -- Don't alert more than once per hour
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_alert_sent_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One rule per asset
  UNIQUE(asset)
);

CREATE INDEX IF NOT EXISTS idx_treasury_threshold_rules_asset ON public.treasury_threshold_rules(asset);
CREATE INDEX IF NOT EXISTS idx_treasury_threshold_rules_active ON public.treasury_threshold_rules(is_active) WHERE is_active = true;

-- Insert default threshold rules
INSERT INTO public.treasury_threshold_rules (asset, minimum_balance, critical_balance, optimal_balance, auto_disable_trading)
VALUES 
  ('BTC', 0.1, 0.05, 1.0, false),
  ('ETH', 1.0, 0.5, 10.0, false),
  ('SOL', 10.0, 5.0, 100.0, false),
  ('USDT', 1000.0, 500.0, 10000.0, false),
  ('USDC', 1000.0, 500.0, 10000.0, false),
  ('XRP', 1000.0, 500.0, 10000.0, false),
  ('NGN', 1000000.0, 500000.0, 10000000.0, true)
ON CONFLICT (asset) DO NOTHING;

-- ============================================================================
-- 3. LIQUIDITY & RISK CONTROLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.liquidity_controls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Wallet type
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('HOT', 'COLD', 'MAIN')),
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN')),
  
  -- Balance limits
  maximum_balance DECIMAL(20, 8),
  minimum_balance DECIMAL(20, 8),
  current_balance DECIMAL(20, 8) DEFAULT 0,
  
  -- Withdrawal limits
  daily_withdrawal_limit DECIMAL(20, 8),
  daily_withdrawal_used DECIMAL(20, 8) DEFAULT 0,
  withdrawal_limit_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
  
  -- Velocity limits
  hourly_withdrawal_limit DECIMAL(20, 8),
  hourly_withdrawal_used DECIMAL(20, 8) DEFAULT 0,
  hourly_limit_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  
  -- Emergency controls
  is_frozen BOOLEAN DEFAULT false NOT NULL,
  freeze_reason TEXT,
  frozen_by UUID REFERENCES auth.users(id),
  frozen_at TIMESTAMPTZ,
  
  -- Utilization tracking
  utilization_percentage DECIMAL(5, 2) DEFAULT 0, -- Current balance / Maximum balance
  target_utilization_percentage DECIMAL(5, 2) DEFAULT 70.0,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One control per wallet type + asset
  UNIQUE(wallet_type, asset)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_controls_wallet_type ON public.liquidity_controls(wallet_type);
CREATE INDEX IF NOT EXISTS idx_liquidity_controls_asset ON public.liquidity_controls(asset);
CREATE INDEX IF NOT EXISTS idx_liquidity_controls_frozen ON public.liquidity_controls(is_frozen) WHERE is_frozen = true;

-- Emergency freeze switch (global)
CREATE TABLE IF NOT EXISTS public.emergency_controls (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  
  -- Global freeze
  is_system_frozen BOOLEAN DEFAULT false NOT NULL,
  freeze_reason TEXT,
  frozen_by UUID REFERENCES auth.users(id),
  frozen_at TIMESTAMPTZ,
  
  -- Trading controls
  trading_enabled BOOLEAN DEFAULT true NOT NULL,
  withdrawals_enabled BOOLEAN DEFAULT true NOT NULL,
  deposits_enabled BOOLEAN DEFAULT true NOT NULL,
  
  -- Maintenance mode
  maintenance_mode BOOLEAN DEFAULT false NOT NULL,
  maintenance_message TEXT,
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO public.emergency_controls (id, is_system_frozen, trading_enabled, withdrawals_enabled, deposits_enabled)
VALUES (1, false, true, true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. SETTLEMENT & FLOAT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settlement_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Report period
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type TEXT NOT NULL CHECK (report_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- NGN Float summary
  opening_balance DECIMAL(20, 2) NOT NULL,
  closing_balance DECIMAL(20, 2) NOT NULL,
  total_credits DECIMAL(20, 2) DEFAULT 0,
  total_debits DECIMAL(20, 2) DEFAULT 0,
  net_change DECIMAL(20, 2) DEFAULT 0,
  
  -- Bank reconciliation
  bank_account_balance DECIMAL(20, 2),
  bank_reconciliation_status TEXT CHECK (bank_reconciliation_status IN ('PENDING', 'RECONCILED', 'DISCREPANCY')),
  bank_discrepancy DECIMAL(20, 2) DEFAULT 0,
  
  -- Float aging
  float_age_days INTEGER DEFAULT 0,
  aging_analysis JSONB DEFAULT '{}', -- Breakdown by age buckets
  
  -- Settlement status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'DISCREPANCY')),
  settlement_failed BOOLEAN DEFAULT false,
  failure_reason TEXT,
  alert_sent BOOLEAN DEFAULT false,
  
  -- Generated by
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  notes TEXT,
  report_data JSONB DEFAULT '{}', -- Full report data
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One report per date and type
  UNIQUE(report_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_settlement_reports_date ON public.settlement_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_reports_type ON public.settlement_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_settlement_reports_status ON public.settlement_reports(status);
CREATE INDEX IF NOT EXISTS idx_settlement_reports_failed ON public.settlement_reports(settlement_failed) WHERE settlement_failed = true;

-- ============================================================================
-- 5. MONITORING & ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Alert information
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'PRICE_DEVIATION', 'LOW_BALANCE', 'CRITICAL_BALANCE', 'DISCREPANCY', 
    'THRESHOLD_BREACH', 'SETTLEMENT_FAILURE', 'RECONCILIATION_FAILURE',
    'WITHDRAWAL_LIMIT', 'EMERGENCY_FREEZE', 'SYSTEM_HEALTH'
  )),
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  -- Asset/Entity
  asset TEXT,
  entity_type TEXT, -- 'BALANCE', 'TRANSACTION', 'SETTLEMENT', etc.
  entity_id UUID,
  
  -- Alert details
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')),
  
  -- Channels
  channels_sent TEXT[] DEFAULT ARRAY[]::TEXT[], -- 'EMAIL', 'SLACK', 'SMS'
  sent_at TIMESTAMPTZ,
  
  -- Resolution
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_treasury_alerts_type ON public.treasury_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_severity ON public.treasury_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_status ON public.treasury_alerts(status);
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_asset ON public.treasury_alerts(asset);
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_pending ON public.treasury_alerts(status, created_at) WHERE status = 'PENDING';

-- Alert configuration
CREATE TABLE IF NOT EXISTS public.alert_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Alert type
  alert_type TEXT NOT NULL UNIQUE CHECK (alert_type IN (
    'PRICE_DEVIATION', 'LOW_BALANCE', 'CRITICAL_BALANCE', 'DISCREPANCY', 
    'THRESHOLD_BREACH', 'SETTLEMENT_FAILURE', 'RECONCILIATION_FAILURE',
    'WITHDRAWAL_LIMIT', 'EMERGENCY_FREEZE', 'SYSTEM_HEALTH'
  )),
  
  -- Channels
  email_enabled BOOLEAN DEFAULT true NOT NULL,
  slack_enabled BOOLEAN DEFAULT false NOT NULL,
  sms_enabled BOOLEAN DEFAULT false NOT NULL,
  
  -- Recipients
  email_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  slack_webhook_url TEXT,
  sms_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Thresholds
  severity_threshold TEXT DEFAULT 'MEDIUM' CHECK (severity_threshold IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  min_severity_to_send TEXT DEFAULT 'MEDIUM',
  
  -- Rate limiting
  cooldown_minutes INTEGER DEFAULT 60, -- Don't send same alert more than once per hour
  max_alerts_per_day INTEGER DEFAULT 10,
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default alert configurations
INSERT INTO public.alert_configurations (alert_type, email_enabled, severity_threshold)
VALUES 
  ('PRICE_DEVIATION', true, 'MEDIUM'),
  ('LOW_BALANCE', true, 'MEDIUM'),
  ('CRITICAL_BALANCE', true, 'HIGH'),
  ('DISCREPANCY', true, 'HIGH'),
  ('THRESHOLD_BREACH', true, 'HIGH'),
  ('SETTLEMENT_FAILURE', true, 'CRITICAL'),
  ('RECONCILIATION_FAILURE', true, 'HIGH'),
  ('WITHDRAWAL_LIMIT', true, 'MEDIUM'),
  ('EMERGENCY_FREEZE', true, 'CRITICAL'),
  ('SYSTEM_HEALTH', true, 'MEDIUM')
ON CONFLICT (alert_type) DO NOTHING;

-- ============================================================================
-- 6. COMPLIANCE & REPORTING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.treasury_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Report information
  report_type TEXT NOT NULL CHECK (report_type IN (
    'DAILY_SUMMARY', 'WEEKLY_SUMMARY', 'MONTHLY_SUMMARY', 'RECONCILIATION',
    'SETTLEMENT', 'AUDIT', 'COMPLIANCE', 'CUSTOM'
  )),
  report_format TEXT NOT NULL DEFAULT 'PDF' CHECK (report_format IN ('PDF', 'CSV', 'JSON', 'EXCEL')),
  
  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Report data
  report_data JSONB NOT NULL DEFAULT '{}',
  file_path TEXT, -- Path to generated file
  file_size_bytes INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED')),
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ,
  
  -- Export metadata
  is_export_ready BOOLEAN DEFAULT false NOT NULL,
  regulatory_compliant BOOLEAN DEFAULT true NOT NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_treasury_reports_type ON public.treasury_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_treasury_reports_period ON public.treasury_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_treasury_reports_status ON public.treasury_reports(status);
CREATE INDEX IF NOT EXISTS idx_treasury_reports_export_ready ON public.treasury_reports(is_export_ready) WHERE is_export_ready = true;

-- Transaction anomaly detection
CREATE TABLE IF NOT EXISTS public.transaction_anomalies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Transaction reference
  transaction_id UUID REFERENCES public.transactions(id),
  
  -- Anomaly details
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'UNUSUAL_AMOUNT', 'UNUSUAL_FREQUENCY', 'UNUSUAL_TIME', 'SUSPICIOUS_PATTERN',
    'VELOCITY_BREACH', 'THRESHOLD_BREACH', 'ADDRESS_MISMATCH', 'OTHER'
  )),
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  -- Detection details
  detected_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  detected_by TEXT DEFAULT 'SYSTEM', -- 'SYSTEM', 'ADMIN', etc.
  detection_rules JSONB DEFAULT '{}',
  
  -- Analysis
  risk_score DECIMAL(5, 2) DEFAULT 0, -- 0-100
  analysis_notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'REVIEWING', 'FALSE_POSITIVE', 'CONFIRMED', 'RESOLVED')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_anomalies_type ON public.transaction_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_transaction_anomalies_severity ON public.transaction_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_transaction_anomalies_status ON public.transaction_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_transaction_anomalies_transaction ON public.transaction_anomalies(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_anomalies_detected ON public.transaction_anomalies(detected_at DESC);

-- ============================================================================
-- 7. ROLE-BASED PERMISSIONS (Enhancement)
-- ============================================================================

-- Treasury role permissions
CREATE TABLE IF NOT EXISTS public.treasury_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Role
  role_name TEXT NOT NULL UNIQUE, -- 'TREASURY_ADMIN', 'TREASURY_VIEWER', 'TREASURY_OPERATOR', etc.
  
  -- Permissions (JSONB for flexibility)
  permissions JSONB NOT NULL DEFAULT '{}',
  
  -- Common permissions structure:
  -- {
  --   "can_view_dashboard": true,
  --   "can_manage_inventory": false,
  --   "can_approve_settlements": false,
  --   "can_manage_thresholds": false,
  --   "can_emergency_freeze": false,
  --   "can_generate_reports": true,
  --   "can_view_audit_logs": true,
  --   "can_manage_pricing": false
  -- }
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default roles
INSERT INTO public.treasury_permissions (role_name, permissions, description)
VALUES 
  ('TREASURY_ADMIN', '{"can_view_dashboard": true, "can_manage_inventory": true, "can_approve_settlements": true, "can_manage_thresholds": true, "can_emergency_freeze": true, "can_generate_reports": true, "can_view_audit_logs": true, "can_manage_pricing": true}', 'Full access to all treasury functions'),
  ('TREASURY_OPERATOR', '{"can_view_dashboard": true, "can_manage_inventory": true, "can_approve_settlements": false, "can_manage_thresholds": false, "can_emergency_freeze": false, "can_generate_reports": true, "can_view_audit_logs": true, "can_manage_pricing": false}', 'Can manage inventory and view reports, but cannot approve settlements or freeze system'),
  ('TREASURY_VIEWER', '{"can_view_dashboard": true, "can_manage_inventory": false, "can_approve_settlements": false, "can_manage_thresholds": false, "can_emergency_freeze": false, "can_generate_reports": true, "can_view_audit_logs": true, "can_manage_pricing": false}', 'Read-only access to treasury dashboard and reports')
ON CONFLICT (role_name) DO NOTHING;

-- User role assignments
CREATE TABLE IF NOT EXISTS public.user_treasury_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_name TEXT NOT NULL,
  
  -- Approval workflow
  requires_approval BOOLEAN DEFAULT false NOT NULL,
  approval_workflow JSONB DEFAULT '{}', -- Define approval chain
  
  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One role per user (can be extended later)
  UNIQUE(user_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_user_treasury_roles_user ON public.user_treasury_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_treasury_roles_role ON public.user_treasury_roles(role_name);
CREATE INDEX IF NOT EXISTS idx_user_treasury_roles_active ON public.user_treasury_roles(is_active) WHERE is_active = true;

-- ============================================================================
-- 8. ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Price cache
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view price cache" ON public.price_cache FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage price cache" ON public.price_cache FOR ALL USING (true) WITH CHECK (true);

-- Price sources
ALTER TABLE public.price_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view price sources" ON public.price_sources FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage price sources" ON public.price_sources FOR ALL USING (true) WITH CHECK (true);

-- Treasury threshold rules
ALTER TABLE public.treasury_threshold_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage threshold rules" ON public.treasury_threshold_rules FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Liquidity controls
ALTER TABLE public.liquidity_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage liquidity controls" ON public.liquidity_controls FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Emergency controls
ALTER TABLE public.emergency_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage emergency controls" ON public.emergency_controls FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Settlement reports
ALTER TABLE public.settlement_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settlement reports" ON public.settlement_reports FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Treasury alerts
ALTER TABLE public.treasury_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view treasury alerts" ON public.treasury_alerts FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage treasury alerts" ON public.treasury_alerts FOR ALL USING (true) WITH CHECK (true);

-- Alert configurations
ALTER TABLE public.alert_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage alert configurations" ON public.alert_configurations FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Treasury reports
ALTER TABLE public.treasury_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage treasury reports" ON public.treasury_reports FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- Transaction anomalies
ALTER TABLE public.transaction_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view transaction anomalies" ON public.transaction_anomalies FOR SELECT USING (public.is_user_admin(auth.uid()));
CREATE POLICY "Service role can manage transaction anomalies" ON public.transaction_anomalies FOR ALL USING (true) WITH CHECK (true);

-- Treasury permissions
ALTER TABLE public.treasury_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage treasury permissions" ON public.treasury_permissions FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- User treasury roles
ALTER TABLE public.user_treasury_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage user treasury roles" ON public.user_treasury_roles FOR ALL USING (public.is_user_admin(auth.uid())) WITH CHECK (public.is_user_admin(auth.uid()));

-- ============================================================================
-- 9. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get latest price for an asset
CREATE OR REPLACE FUNCTION public.get_latest_price(p_asset TEXT)
RETURNS TABLE (
  price_usd DECIMAL(20, 8),
  price_ngn DECIMAL(20, 2),
  price_source TEXT,
  fetched_at TIMESTAMPTZ,
  is_fallback BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.price_usd,
    pc.price_ngn,
    pc.price_source,
    pc.fetched_at,
    pc.is_fallback
  FROM public.price_cache pc
  WHERE pc.asset = p_asset
  ORDER BY pc.fetched_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if balance is below threshold
CREATE OR REPLACE FUNCTION public.check_balance_threshold(p_asset TEXT, p_current_balance DECIMAL)
RETURNS TABLE (
  is_below_minimum BOOLEAN,
  is_below_critical BOOLEAN,
  should_disable_trading BOOLEAN,
  threshold_rule JSONB
) AS $$
DECLARE
  v_rule RECORD;
BEGIN
  SELECT * INTO v_rule
  FROM public.treasury_threshold_rules
  WHERE asset = p_asset AND is_active = true
  LIMIT 1;
  
  IF v_rule IS NULL THEN
    RETURN QUERY SELECT false, false, false, '{}'::JSONB;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    (p_current_balance < v_rule.minimum_balance) AS is_below_minimum,
    (p_current_balance < v_rule.critical_balance) AS is_below_critical,
    (p_current_balance < v_rule.minimum_balance AND v_rule.auto_disable_trading) AS should_disable_trading,
    jsonb_build_object(
      'minimum_balance', v_rule.minimum_balance,
      'critical_balance', v_rule.critical_balance,
      'auto_disable_trading', v_rule.auto_disable_trading
    ) AS threshold_rule;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create alert
CREATE OR REPLACE FUNCTION public.create_treasury_alert(
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_asset TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
  v_config RECORD;
BEGIN
  -- Get alert configuration
  SELECT * INTO v_config
  FROM public.alert_configurations
  WHERE alert_type = p_alert_type AND is_active = true
  LIMIT 1;
  
  -- Create alert
  INSERT INTO public.treasury_alerts (
    alert_type, severity, title, message, asset, details, status
  ) VALUES (
    p_alert_type, p_severity, p_title, p_message, p_asset, p_details, 'PENDING'
  ) RETURNING id INTO v_alert_id;
  
  -- TODO: Send alerts via configured channels (email, slack, etc.)
  -- This would be handled by a background job or edge function
  
  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.price_cache IS 'Cached cryptocurrency prices with fallback mechanism and deviation tracking';
COMMENT ON TABLE public.price_sources IS 'Configuration for price data sources (CoinGecko, exchanges, etc.)';
COMMENT ON TABLE public.treasury_threshold_rules IS 'Minimum and critical balance thresholds per asset with auto-disable trading';
COMMENT ON TABLE public.liquidity_controls IS 'Hot/cold wallet separation, withdrawal limits, and velocity controls';
COMMENT ON TABLE public.emergency_controls IS 'Global emergency freeze switch and system controls';
COMMENT ON TABLE public.settlement_reports IS 'Daily/weekly/monthly NGN settlement reports with bank reconciliation';
COMMENT ON TABLE public.treasury_alerts IS 'Treasury alerts for discrepancies, thresholds, and system health';
COMMENT ON TABLE public.alert_configurations IS 'Configuration for alert channels (email, slack, sms) and thresholds';
COMMENT ON TABLE public.treasury_reports IS 'Downloadable treasury reports in PDF/CSV/Excel formats';
COMMENT ON TABLE public.transaction_anomalies IS 'Detected transaction anomalies for compliance and risk management';
COMMENT ON TABLE public.treasury_permissions IS 'Role-based permissions for treasury management';
COMMENT ON TABLE public.user_treasury_roles IS 'User assignments to treasury roles with approval workflows';
