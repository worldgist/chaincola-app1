-- Make asset amount columns nullable in sells table
-- This allows sells to have only one asset type (BTC, ETH, XRP, or SOL)

-- Make btc_amount nullable
ALTER TABLE public.sells ALTER COLUMN btc_amount DROP NOT NULL;

-- Drop the positive_btc_amount constraint since btc_amount can be NULL
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS positive_btc_amount;

-- Add a new constraint that ensures at least one asset amount is provided and positive
ALTER TABLE public.sells ADD CONSTRAINT at_least_one_asset_amount CHECK (
  (btc_amount IS NOT NULL AND btc_amount > 0) OR
  (eth_amount IS NOT NULL AND eth_amount > 0) OR
  (xrp_amount IS NOT NULL AND xrp_amount > 0) OR
  (sol_amount IS NOT NULL AND sol_amount > 0)
);

-- Add constraint to ensure only one asset amount is set per sell order
ALTER TABLE public.sells ADD CONSTRAINT only_one_asset_amount CHECK (
  (CASE WHEN btc_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN eth_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN xrp_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN sol_amount IS NOT NULL THEN 1 ELSE 0 END) = 1
);

COMMENT ON CONSTRAINT at_least_one_asset_amount ON public.sells IS 'Ensures at least one asset amount (BTC, ETH, XRP, or SOL) is provided';
COMMENT ON CONSTRAINT only_one_asset_amount ON public.sells IS 'Ensures only one asset type per sell order';









