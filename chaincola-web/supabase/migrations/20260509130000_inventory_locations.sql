-- Logical storage locations for treasury crypto inventory (hot / cold / primary reserve).
-- Ledger amounts remain on public.system_wallets; on-chain on public.on_chain_balances;
-- movements on public.inventory_adjustments.

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  maps_to_system_reserve BOOLEAN DEFAULT false NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT inventory_locations_code_key UNIQUE (code),
  CONSTRAINT inventory_locations_code_format CHECK (char_length(trim(code)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_active_sort
  ON public.inventory_locations (is_active, sort_order);

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view inventory locations" ON public.inventory_locations;
CREATE POLICY "Admins can view inventory locations"
  ON public.inventory_locations
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage inventory locations" ON public.inventory_locations;
CREATE POLICY "Service role can manage inventory locations"
  ON public.inventory_locations
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.inventory_locations (code, name, description, maps_to_system_reserve, sort_order)
VALUES
  (
    'PRIMARY_RESERVE',
    'Primary reserve',
    'Main treasury addresses on system_wallets; ledger inventory and on_chain_balances reconciliation.',
    true,
    1
  ),
  (
    'HOT_WALLET',
    'Hot wallet',
    'Operational liquidity for fast settlements (configure separate custody when splitting from primary).',
    false,
    2
  ),
  (
    'COLD_STORAGE',
    'Cold storage',
    'Offline or segregated reserves; track separately when custody is split from primary reserve.',
    false,
    3
  )
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.inventory_locations IS 'Where treasury crypto is stored (logical buckets); balances still sourced from system_wallets + on_chain_balances until per-location splits exist.';
