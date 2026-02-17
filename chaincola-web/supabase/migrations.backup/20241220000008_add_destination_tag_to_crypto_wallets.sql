-- Add destination_tag column for XRP wallets
ALTER TABLE public.crypto_wallets
ADD COLUMN IF NOT EXISTS destination_tag TEXT;

-- Add comment
COMMENT ON COLUMN public.crypto_wallets.destination_tag IS 'Destination tag for XRP (Ripple) addresses';
