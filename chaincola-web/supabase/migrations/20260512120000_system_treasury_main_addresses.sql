-- Canonical public deposit addresses for treasury (no dependency on any user's crypto_wallets).
-- Mirrors into public.system_wallets (id = 1) so existing RPCs and triggers keep using system_wallets.

CREATE TABLE IF NOT EXISTS public.system_treasury_main_addresses (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  btc_main_address TEXT,
  eth_main_address TEXT,
  usdt_eth_main_address TEXT,
  usdc_eth_main_address TEXT,
  sol_main_address TEXT,
  usdc_sol_main_address TEXT,
  xrp_main_address TEXT,
  usdt_tron_main_address TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.system_treasury_main_addresses IS
  'Treasury main deposit addresses (public only). Single row id=1. Synced to system_wallets main-address columns via trigger.';

-- Seed / backfill from existing system_wallets so nothing is lost on upgrade.
INSERT INTO public.system_treasury_main_addresses (
  id,
  btc_main_address,
  eth_main_address,
  usdt_eth_main_address,
  usdc_eth_main_address,
  sol_main_address,
  usdc_sol_main_address,
  xrp_main_address,
  usdt_tron_main_address
)
SELECT
  1,
  sw.btc_main_address,
  sw.eth_main_address,
  sw.usdt_eth_main_address,
  sw.usdc_eth_main_address,
  sw.sol_main_address,
  sw.usdc_sol_main_address,
  sw.xrp_main_address,
  sw.usdt_tron_main_address
FROM public.system_wallets sw
WHERE sw.id = 1
ON CONFLICT (id) DO UPDATE SET
  btc_main_address = COALESCE(public.system_treasury_main_addresses.btc_main_address, EXCLUDED.btc_main_address),
  eth_main_address = COALESCE(public.system_treasury_main_addresses.eth_main_address, EXCLUDED.eth_main_address),
  usdt_eth_main_address = COALESCE(public.system_treasury_main_addresses.usdt_eth_main_address, EXCLUDED.usdt_eth_main_address),
  usdc_eth_main_address = COALESCE(public.system_treasury_main_addresses.usdc_eth_main_address, EXCLUDED.usdc_eth_main_address),
  sol_main_address = COALESCE(public.system_treasury_main_addresses.sol_main_address, EXCLUDED.sol_main_address),
  usdc_sol_main_address = COALESCE(public.system_treasury_main_addresses.usdc_sol_main_address, EXCLUDED.usdc_sol_main_address),
  xrp_main_address = COALESCE(public.system_treasury_main_addresses.xrp_main_address, EXCLUDED.xrp_main_address),
  usdt_tron_main_address = COALESCE(public.system_treasury_main_addresses.usdt_tron_main_address, EXCLUDED.usdt_tron_main_address),
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.sync_system_wallets_from_system_treasury_main_addresses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.system_wallets sw
  SET
    btc_main_address = NEW.btc_main_address,
    eth_main_address = NEW.eth_main_address,
    usdt_eth_main_address = NEW.usdt_eth_main_address,
    usdc_eth_main_address = NEW.usdc_eth_main_address,
    sol_main_address = NEW.sol_main_address,
    usdc_sol_main_address = NEW.usdc_sol_main_address,
    xrp_main_address = NEW.xrp_main_address,
    usdt_tron_main_address = NEW.usdt_tron_main_address,
    updated_at = NOW()
  WHERE sw.id = 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_treasury_main_addresses_sync_system_wallets ON public.system_treasury_main_addresses;
CREATE TRIGGER trg_system_treasury_main_addresses_sync_system_wallets
  AFTER INSERT OR UPDATE ON public.system_treasury_main_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_system_wallets_from_system_treasury_main_addresses();

ALTER TABLE public.system_treasury_main_addresses ENABLE ROW LEVEL SECURITY;
