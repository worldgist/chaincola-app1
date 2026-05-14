-- Treasury USDT on Solana (SPL) — alongside ERC-20 and TRC-20.

ALTER TABLE public.system_wallets
  ADD COLUMN IF NOT EXISTS usdt_sol_main_address TEXT;

COMMENT ON COLUMN public.system_wallets.usdt_sol_main_address IS
  'USDT on Solana (SPL) treasury receive address; optional.';

CREATE INDEX IF NOT EXISTS idx_system_wallets_usdt_sol_address
  ON public.system_wallets (usdt_sol_main_address)
  WHERE usdt_sol_main_address IS NOT NULL;
