-- Update TRON asset name from "TRX" to "TRON"
-- Per specification: One TRON wallet per user (same address for TRX and USDT-TRC20)
-- Asset should be stored as "TRON" (not "TRX")

-- First, deactivate any TRX wallets where user already has an active TRON wallet
UPDATE public.crypto_wallets cw1
SET is_active = false
WHERE cw1.asset = 'TRX'
  AND cw1.network = 'mainnet'
  AND EXISTS (
    SELECT 1 
    FROM public.crypto_wallets cw2 
    WHERE cw2.user_id = cw1.user_id 
      AND cw2.asset = 'TRON' 
      AND cw2.network = 'mainnet'
      AND cw2.is_active = true
  );

-- Update existing TRX wallets to TRON (only if no TRON wallet exists for that user)
UPDATE public.crypto_wallets cw1
SET asset = 'TRON'
WHERE cw1.asset = 'TRX'
  AND cw1.network = 'mainnet'
  AND NOT EXISTS (
    SELECT 1 
    FROM public.crypto_wallets cw2 
    WHERE cw2.user_id = cw1.user_id 
      AND cw2.asset = 'TRON' 
      AND cw2.network = 'mainnet'
  );

-- Add comment
COMMENT ON COLUMN public.crypto_wallets.asset IS 'Cryptocurrency asset name (BTC, ETH, TRON, etc.). TRON wallets use "TRON" for both TRX and USDT-TRC20.';

