-- Logical NGN treasury "vaults" for company liquidity reporting.
-- Allocated amounts are computed shares of public.system_wallets.ngn_float_balance (id = 1); not separate ledgers.

CREATE TABLE IF NOT EXISTS public.ngn_liquidity_vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  allocation_percent NUMERIC(10, 4) NOT NULL DEFAULT 0
    CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ngn_liquidity_vaults_code_key UNIQUE (code),
  CONSTRAINT ngn_liquidity_vaults_code_format CHECK (char_length(trim(code)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ngn_liquidity_vaults_active_sort
  ON public.ngn_liquidity_vaults (is_active, sort_order);

COMMENT ON TABLE public.ngn_liquidity_vaults IS 'Reporting buckets for NGN treasury liquidity; balances are derived from system_wallets.ngn_float_balance using allocation_percent on active rows (should sum to 100).';

ALTER TABLE public.ngn_liquidity_vaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view ngn liquidity vaults" ON public.ngn_liquidity_vaults;
CREATE POLICY "Admins can view ngn liquidity vaults"
  ON public.ngn_liquidity_vaults
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage ngn liquidity vaults" ON public.ngn_liquidity_vaults;
CREATE POLICY "Admins can manage ngn liquidity vaults"
  ON public.ngn_liquidity_vaults
  FOR ALL
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage ngn liquidity vaults" ON public.ngn_liquidity_vaults;
CREATE POLICY "Service role can manage ngn liquidity vaults"
  ON public.ngn_liquidity_vaults
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.ngn_liquidity_vaults (code, name, description, allocation_percent, sort_order)
VALUES
  (
    'MAIN_TREASURY_RESERVE',
    'Main treasury reserve',
    'Core company NGN reserve (policy slice of system NGN float).',
    30.0000,
    1
  ),
  (
    'INSTANT_RAIL_LIQUIDITY',
    'Instant rail liquidity',
    'Instant buy/sell and user-facing NGN rail liquidity.',
    40.0000,
    2
  ),
  (
    'SETTLEMENTS_AND_PAYOUTS',
    'Settlements & payouts',
    'Merchant settlements, withdrawals, and payout buffers.',
    20.0000,
    3
  ),
  (
    'CORPORATE_OPERATING',
    'Corporate operating',
    'Operating buffer, fees, and internal treasury movements.',
    10.0000,
    4
  )
ON CONFLICT (code) DO NOTHING;
