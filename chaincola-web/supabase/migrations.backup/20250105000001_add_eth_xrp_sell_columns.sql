-- Add ETH and XRP columns to sells table
-- This migration adds support for selling ETH and XRP in addition to BTC

-- Add ETH columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'eth_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN eth_amount DECIMAL(20, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'locked_eth_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_eth_amount DECIMAL(20, 8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'eth_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN eth_tx_hash TEXT;
  END IF;
END $$;

-- Add XRP columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'xrp_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN xrp_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'locked_xrp_amount'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN locked_xrp_amount DECIMAL(20, 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'sells'
    AND column_name = 'xrp_tx_hash'
  ) THEN
    ALTER TABLE public.sells ADD COLUMN xrp_tx_hash TEXT;
  END IF;
END $$;

-- Update valid_sell_status constraint to include ETH and XRP statuses
ALTER TABLE public.sells DROP CONSTRAINT IF EXISTS valid_sell_status;

ALTER TABLE public.sells ADD CONSTRAINT valid_sell_status CHECK (
  status IN (
    'INITIATED',
    'QUOTED',
    'BTC_SENT',
    'ETH_SENT',
    'XRP_SENT',
    'BTC_CREDITED_ON_LUNO',
    'ETH_CREDITED_ON_LUNO',
    'XRP_CREDITED_ON_LUNO',
    'SOLD_ON_LUNO',
    'COMPLETED',
    'SELL_FAILED',
    'EXPIRED'
  )
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sells_eth_tx_hash ON public.sells(eth_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_xrp_tx_hash ON public.sells(xrp_tx_hash);
CREATE INDEX IF NOT EXISTS idx_sells_status_eth ON public.sells(status) WHERE status = 'ETH_SENT';
CREATE INDEX IF NOT EXISTS idx_sells_status_xrp ON public.sells(status) WHERE status = 'XRP_SENT';

COMMENT ON COLUMN public.sells.eth_amount IS 'Amount of ETH being sold';
COMMENT ON COLUMN public.sells.locked_eth_amount IS 'Amount of ETH locked for this sell order';
COMMENT ON COLUMN public.sells.eth_tx_hash IS 'Ethereum transaction hash for ETH transfer to Luno';
COMMENT ON COLUMN public.sells.xrp_amount IS 'Amount of XRP being sold';
COMMENT ON COLUMN public.sells.locked_xrp_amount IS 'Amount of XRP locked for this sell order';
COMMENT ON COLUMN public.sells.xrp_tx_hash IS 'XRP transaction hash for XRP transfer to Luno';









