-- Real treasury movement log, allocation rules, multi-bank / provider balances (reconciliation scaffold).

CREATE TABLE IF NOT EXISTS public.treasury_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'ALLOCATION',
    'WITHDRAWAL',
    'SETTLEMENT',
    'RESERVE_LOCK',
    'FLOAT_TOPUP'
  )),
  amount NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  metadata JSONB NOT NULL DEFAULT '{}',
  counterparty_vault_code TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_movements_created_at ON public.treasury_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_movements_vault_type ON public.treasury_movements (vault_code, type);
CREATE INDEX IF NOT EXISTS idx_treasury_movements_reference ON public.treasury_movements (reference) WHERE reference <> '';

COMMENT ON TABLE public.treasury_movements IS 'Treasury journal: float top-ups, internal notional reallocations, settlements, etc. Does not replace system_wallets; pairs may share reference.';

ALTER TABLE public.treasury_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view treasury movements" ON public.treasury_movements;
CREATE POLICY "Admins can view treasury movements"
  ON public.treasury_movements FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert treasury movements" ON public.treasury_movements;
CREATE POLICY "Admins can insert treasury movements"
  ON public.treasury_movements FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage treasury movements" ON public.treasury_movements;
CREATE POLICY "Service role can manage treasury movements"
  ON public.treasury_movements FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.treasury_allocation_rules (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_reserve_lock_pct NUMERIC(8, 4) NOT NULL DEFAULT 25.0000
    CHECK (min_reserve_lock_pct >= 0 AND min_reserve_lock_pct <= 100),
  max_payout_exposure_pct NUMERIC(8, 4) NOT NULL DEFAULT 40.0000
    CHECK (max_payout_exposure_pct >= 0 AND max_payout_exposure_pct <= 100),
  emergency_reserve_pct NUMERIC(8, 4) NOT NULL DEFAULT 10.0000
    CHECK (emergency_reserve_pct >= 0 AND emergency_reserve_pct <= 100),
  instant_liquidity_floor_ngn NUMERIC(20, 2) NOT NULL DEFAULT 2000000.00
    CHECK (instant_liquidity_floor_ngn >= 0),
  auto_liquidity_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_freeze_on_critical BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.treasury_allocation_rules (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.treasury_allocation_rules IS 'Singleton (id=1): liquidity policy knobs for treasury UI and auto-liquidity engine.';

ALTER TABLE public.treasury_allocation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view treasury allocation rules" ON public.treasury_allocation_rules;
CREATE POLICY "Admins can view treasury allocation rules"
  ON public.treasury_allocation_rules FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update treasury allocation rules" ON public.treasury_allocation_rules;
CREATE POLICY "Admins can update treasury allocation rules"
  ON public.treasury_allocation_rules FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage treasury allocation rules" ON public.treasury_allocation_rules;
CREATE POLICY "Service role can manage treasury allocation rules"
  ON public.treasury_allocation_rules FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.treasury_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  external_ref TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  reported_balance_ngn NUMERIC(20, 2) NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_active_sort
  ON public.treasury_bank_accounts (is_active, sort_order);

COMMENT ON TABLE public.treasury_bank_accounts IS 'External NGN rails (banks, PSP wallets) for reconciliation vs internal ledger.';

ALTER TABLE public.treasury_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view treasury bank accounts" ON public.treasury_bank_accounts;
CREATE POLICY "Admins can view treasury bank accounts"
  ON public.treasury_bank_accounts FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage treasury bank accounts" ON public.treasury_bank_accounts;
CREATE POLICY "Admins can manage treasury bank accounts"
  ON public.treasury_bank_accounts FOR ALL
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage treasury bank accounts" ON public.treasury_bank_accounts;
CREATE POLICY "Service role can manage treasury bank accounts"
  ON public.treasury_bank_accounts FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.treasury_bank_accounts (bank_name, provider, external_ref, reported_balance_ngn, sort_order, metadata)
SELECT
  'Primary operating (manual)',
  'MANUAL',
  'PRIMARY_NGN',
  0,
  1,
  '{"note": "Set reported_balance_ngn from bank statements; optional Flutterwave row can be added separately."}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.treasury_bank_accounts t WHERE t.external_ref = 'PRIMARY_NGN'
);
