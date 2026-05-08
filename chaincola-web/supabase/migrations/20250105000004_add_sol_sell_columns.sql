-- Add SOL columns to sells table
-- This migration adds support for selling SOL in addition to BTC, ETH, and XRP

-- Add SOL columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'sol_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN sol_amount DECIMAL(20, 9);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'locked_sol_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_sol_amount DECIMAL(20, 9);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'sol_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN sol_tx_hash TEXT;
  END IF;
END $$;

-- Update valid_sell_status constraint to include SOL statuses
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS valid_sell_status;

ALTER TABLE public.sells ADD CONSTRAINT valid_sell_status CHECK (
  status IN (
    'INITIATED',
    'QUOTED',
    'BTC_SENT',
    'ETH_SENT',
    'XRP_SENT',
    'SOL_SENT',
    'BTC_CREDITED_ON_LUNO',
    'ETH_CREDITED_ON_LUNO',
    'XRP_CREDITED_ON_LUNO',
    'SOL_CREDITED_ON_LUNO',
    'SOLD_ON_LUNO',
    'COMPLETED',
    'SELL_FAILED',
    'EXPIRED'
  )
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sells_sol_tx_hash ON public.sells(sol_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_status_sol ON public.sells(status) WHERE status = 'SOL_SENT';

COMMENT ON COLUMN public.sells.sol_amount IS 'Amount of SOL being sold';
COMMENT ON COLUMN public.sells.locked_sol_amount IS 'Amount of SOL locked for this sell order';
COMMENT ON COLUMN public.sells.sol_tx_hash IS 'Solana transaction signature for SOL transfer to Luno';









