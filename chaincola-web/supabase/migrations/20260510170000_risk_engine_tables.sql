-- Risk engine tables: device fingerprinting, wallet blocklist, transaction monitoring, and risk logs.

CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip TEXT,
  last_country TEXT,
  last_user_agent TEXT,
  is_trusted BOOLEAN NOT NULL DEFAULT false,
  trust_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT device_fingerprints_user_device_key UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON public.device_fingerprints (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_trusted ON public.device_fingerprints (is_trusted) WHERE is_trusted = true;

CREATE TABLE IF NOT EXISTS public.blocked_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  asset TEXT,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_wallets_wallet_key UNIQUE (wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_blocked_wallets_active ON public.blocked_wallets (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.transaction_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('SAFE', 'REVIEW', 'SUSPICIOUS', 'BLOCKED')),
  score INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'ALLOW'
    CHECK (action IN ('ALLOW', 'REQUIRE_OTP', 'REVIEW', 'BLOCK', 'FREEZE')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transaction_monitoring_tx_key UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_monitoring_level ON public.transaction_monitoring (risk_level, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.risk_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- WITHDRAWAL, DEPOSIT, TRANSFER, BUY, SELL, LOGIN, etc.
  score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('SAFE', 'REVIEW', 'SUSPICIOUS', 'BLOCKED')),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REQUIRE_OTP', 'REVIEW', 'BLOCK', 'FREEZE')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table already existed (older migration), ensure required columns exist.
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS run_id UUID;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS decision TEXT;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.risk_logs
  ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_risk_logs_user ON public.risk_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_logs_run ON public.risk_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_risk_logs_level ON public.risk_logs (risk_level, created_at DESC);

ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view device fingerprints" ON public.device_fingerprints;
CREATE POLICY "Admins can view device fingerprints"
  ON public.device_fingerprints FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage device fingerprints" ON public.device_fingerprints;
CREATE POLICY "Service role can manage device fingerprints"
  ON public.device_fingerprints FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view blocked wallets" ON public.blocked_wallets;
CREATE POLICY "Admins can view blocked wallets"
  ON public.blocked_wallets FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage blocked wallets" ON public.blocked_wallets;
CREATE POLICY "Service role can manage blocked wallets"
  ON public.blocked_wallets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view transaction monitoring" ON public.transaction_monitoring;
CREATE POLICY "Admins can view transaction monitoring"
  ON public.transaction_monitoring FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage transaction monitoring" ON public.transaction_monitoring;
CREATE POLICY "Service role can manage transaction monitoring"
  ON public.transaction_monitoring FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view risk logs" ON public.risk_logs;
CREATE POLICY "Admins can view risk logs"
  ON public.risk_logs FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage risk logs" ON public.risk_logs;
CREATE POLICY "Service role can manage risk logs"
  ON public.risk_logs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.risk_logs IS 'Risk scoring runs with decisions (approve/otp/review/block/freeze) and reasons.'; 
COMMENT ON TABLE public.blocked_wallets IS 'Wallet addresses blocked due to sanctions/scam/mixer activity (manual or provider-fed).';
COMMENT ON TABLE public.device_fingerprints IS 'Observed devices per user for new-device and location-change detection.';
COMMENT ON TABLE public.transaction_monitoring IS 'Per-transaction risk classification and decision.';
