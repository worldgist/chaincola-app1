-- Add private_key column to crypto_wallets for backward compatibility
-- Note: private_key_encrypted should be used for new wallets

ALTER TABLE public.crypto_wallets
ADD COLUMN IF NOT EXISTS private_key TEXT; -- Plain text private key (for backward compatibility, deprecated)

-- Add comment
COMMENT ON COLUMN public.crypto_wallets.private_key IS 'Plain text private key (deprecated, use private_key_encrypted instead)';

