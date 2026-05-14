-- Risk engine tables (user/device/wallet/tx monitoring) for automated checks and future admin tooling.

CREATE TABLE IF NOT EXISTS public.blocked_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  asset TEXT,
  reason TEXT NOT NULL,
  source TEXT DEFAULT 'manual' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_wallets_address_format CHECK (char_length(trim(address)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_blocked_wallets_active_address
  ON public.blocked_wallets (is_active, lower(trim(address)));
CREATE INDEX IF NOT EXISTS idx_blocked_wallets_asset
  ON public.blocked_wallets (asset) WHERE asset IS NOT NULL;

ALTER TABLE public.blocked_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view blocked wallets" ON public.blocked_wallets;
CREATE POLICY "Admins can view blocked wallets"
  ON public.blocked_wallets FOR SELECT
  USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage blocked wallets" ON public.blocked_wallets;
CREATE POLICY "Service role can manage blocked wallets"
  ON public.blocked_wallets FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  fingerprint_hash TEXT,
  platform TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip TEXT,
  last_country TEXT,
  last_city TEXT,
  is_trusted BOOLEAN DEFAULT false NOT NULL,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT device_fingerprints_device_id_format CHECK (char_length(trim(device_id)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_fingerprints_user_device
  ON public.device_fingerprints (user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_last_seen
  ON public.device_fingerprints (last_seen_at DESC);

ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view device fingerprints" ON public.device_fingerprints;
CREATE POLICY "Admins can view device fingerprints"
  ON public.device_fingerprints FOR SELECT
  USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage device fingerprints" ON public.device_fingerprints;
CREATE POLICY "Service role can manage device fingerprints"
  ON public.device_fingerprints FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.risk_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REQUIRE_OTP', 'REVIEW', 'BLOCK', 'FREEZE')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip TEXT,
  country TEXT,
  device_id TEXT,
  destination_address TEXT,
  asset TEXT,
  amount DECIMAL(20, 8),
  related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_logs_created_at ON public.risk_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_logs_user_created_at ON public.risk_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_logs_decision ON public.risk_logs (decision, created_at DESC);

ALTER TABLE public.risk_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view risk logs" ON public.risk_logs;
CREATE POLICY "Admins can view risk logs"
  ON public.risk_logs FOR SELECT
  USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage risk logs" ON public.risk_logs;
CREATE POLICY "Service role can manage risk logs"
  ON public.risk_logs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.transaction_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('SAFE', 'REVIEW', 'SUSPICIOUS', 'BLOCKED')),
  score INTEGER NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transaction_monitoring_transaction_unique UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_monitoring_risk_level
  ON public.transaction_monitoring (risk_level, created_at DESC);

ALTER TABLE public.transaction_monitoring ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view transaction monitoring" ON public.transaction_monitoring;
CREATE POLICY "Admins can view transaction monitoring"
  ON public.transaction_monitoring FOR SELECT
  USING (public.is_user_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage transaction monitoring" ON public.transaction_monitoring;
CREATE POLICY "Service role can manage transaction monitoring"
  ON public.transaction_monitoring FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.blocked_wallets IS 'Wallet addresses blocked for scams/sanctions/mixers; checked during withdrawals/settlements.';
COMMENT ON TABLE public.device_fingerprints IS 'Known devices per user for anomaly detection (new device / geo changes).';
COMMENT ON TABLE public.risk_logs IS 'Append-only risk scoring decisions for user actions (withdrawals, transfers, etc.).';
COMMENT ON TABLE public.transaction_monitoring IS 'Per-transaction risk flags and outcomes (SAFE/REVIEW/SUSPICIOUS/BLOCKED).';
