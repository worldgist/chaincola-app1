-- Add USDT and USDC columns to sells table
-- This migration adds support for selling USDT and USDC (ERC-20 tokens)

DO $$
BEGIN
  -- Add USDT columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'usdt_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN usdt_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'locked_usdt_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_usdt_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'usdt_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN usdt_tx_hash TEXT;
  END IF;
END $$;

-- Add USDC columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'usdc_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN usdc_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'locked_usdc_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_usdc_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'usdc_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN usdc_tx_hash TEXT;
  END IF;
END $$;

-- Update at_least_one_asset_amount constraint to include USDT and USDC
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS at_least_one_asset_amount;

ALTER TABLE public.sells ADD CONSTRAINT at_least_one_asset_amount CHECK (
  (btc_amount IS NOT NULL AND btc_amount > 0) OR
  (eth_amount IS NOT NULL AND eth_amount > 0) OR
  (xrp_amount IS NOT NULL AND xrp_amount > 0) OR
  (sol_amount IS NOT NULL AND sol_amount > 0) OR
  (usdt_amount IS NOT NULL AND usdt_amount > 0) OR
  (usdc_amount IS NOT NULL AND usdc_amount > 0)
);

-- Update only_one_asset_amount constraint to include USDT and USDC
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS only_one_asset_amount;

ALTER TABLE public.sells ADD CONSTRAINT only_one_asset_amount CHECK (
  (CASE WHEN btc_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN eth_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN xrp_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN sol_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN usdt_amount IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN usdc_amount IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- Update valid_sell_status constraint to include USDT and USDC statuses
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS valid_sell_status;

ALTER TABLE public.sells ADD CONSTRAINT valid_sell_status CHECK (
  status IN (
    'INITIATED',
    'QUOTED',
    'BTC_SENT',
    'ETH_SENT',
    'XRP_SENT',
    'SOL_SENT',
    'USDT_SENT',
    'USDC_SENT',
    'BTC_CREDITED_ON_LUNO',
    'ETH_CREDITED_ON_LUNO',
    'XRP_CREDITED_ON_LUNO',
    'SOL_CREDITED_ON_LUNO',
    'USDT_CREDITED_ON_LUNO',
    'USDC_CREDITED_ON_LUNO',
    'SOLD_ON_LUNO',
    'COMPLETED',
    'SELL_FAILED',
    'EXPIRED'
  )
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sells_usdt_tx_hash ON public.sells(usdt_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_usdc_tx_hash ON public.sells(usdc_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_status_usdt ON public.sells(status) WHERE status = 'USDT_SENT';
CREATE INDEX IF NOT EXISTS idx_sells_status_usdc ON public.sells(status) WHERE status = 'USDC_SENT';

-- Add comments
COMMENT ON COLUMN public.sells.usdt_amount IS 'Amount of USDT being sold';
COMMENT ON COLUMN public.sells.locked_usdt_amount IS 'Amount of USDT locked for this sell order';
COMMENT ON COLUMN public.sells.usdt_tx_hash IS 'Ethereum transaction hash for USDT (ERC-20) transfer to Luno';
COMMENT ON COLUMN public.sells.usdc_amount IS 'Amount of USDC being sold';
COMMENT ON COLUMN public.sells.locked_usdc_amount IS 'Amount of USDC locked for this sell order';
COMMENT ON COLUMN public.sells.usdc_tx_hash IS 'Ethereum transaction hash for USDC (ERC-20) transfer to Luno';

COMMENT ON CONSTRAINT at_least_one_asset_amount ON public.sells IS 'Ensures at least one asset amount (BTC, ETH, XRP, SOL, USDT, or USDC) is provided';
COMMENT ON CONSTRAINT only_one_asset_amount ON public.sells IS 'Ensures only one asset type per sell order';







