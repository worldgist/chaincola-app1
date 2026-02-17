-- Add main wallet address columns to system_wallets table
-- These are the addresses where real crypto is stored (treasury vault)
-- IMPORTANT: Only addresses are stored, NEVER private keys

ALTER TABLE public.system_wallets
ADD COLUMN IF NOT EXISTS btc_main_address TEXT,
ADD COLUMN IF NOT EXISTS eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS sol_main_address TEXT,
ADD COLUMN IF NOT EXISTS xrp_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdt_eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdt_tron_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdc_eth_main_address TEXT,
ADD COLUMN IF NOT EXISTS usdc_sol_main_address TEXT;

-- Add comments
COMMENT ON COLUMN public.system_wallets.btc_main_address IS 'Main Bitcoin wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.eth_main_address IS 'Main Ethereum wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.sol_main_address IS 'Main Solana wallet address (treasury vault). Also used for USDC SOL. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.xrp_main_address IS 'Main XRP wallet address (treasury vault). Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdt_eth_main_address IS 'USDT on Ethereum network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdt_tron_main_address IS 'USDT on TRON network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdc_eth_main_address IS 'USDC on Ethereum network main wallet address. Only address stored, never private keys.';
COMMENT ON COLUMN public.system_wallets.usdc_sol_main_address IS 'USDC on Solana network main wallet address. Only address stored, never private keys.';

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_wallets_btc_address ON public.system_wallets(btc_main_address) WHERE btc_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_eth_address ON public.system_wallets(eth_main_address) WHERE eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_sol_address ON public.system_wallets(sol_main_address) WHERE sol_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_xrp_address ON public.system_wallets(xrp_main_address) WHERE xrp_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdt_eth_address ON public.system_wallets(usdt_eth_main_address) WHERE usdt_eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdt_tron_address ON public.system_wallets(usdt_tron_main_address) WHERE usdt_tron_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdc_eth_address ON public.system_wallets(usdc_eth_main_address) WHERE usdc_eth_main_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_wallets_usdc_sol_address ON public.system_wallets(usdc_sol_main_address) WHERE usdc_sol_main_address IS NOT NULL;
