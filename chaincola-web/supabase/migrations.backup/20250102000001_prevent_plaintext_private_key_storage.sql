-- Prevent storing plaintext private keys in crypto_wallets table
-- This migration adds database-level safeguards to ensure only encrypted private keys are stored

-- Create a function to validate that private_key is not set when inserting/updating
CREATE OR REPLACE FUNCTION public.validate_no_plaintext_private_key()
RETURNS TRIGGER AS $$
BEGIN
  -- If private_key is being set (not NULL and not empty), reject the operation
  IF NEW.private_key IS NOT NULL AND NEW.private_key != '' THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Plaintext private keys cannot be stored. Only private_key_encrypted is allowed. Attempted to store private key for wallet %', NEW.address;
  END IF;
  
  -- Ensure private_key is always NULL (explicitly set it to NULL if somehow it's not)
  NEW.private_key = NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to prevent plaintext private key storage on INSERT
CREATE TRIGGER prevent_plaintext_private_key_insert
  BEFORE INSERT ON public.crypto_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_no_plaintext_private_key();

-- Create trigger to prevent plaintext private key storage on UPDATE
CREATE TRIGGER prevent_plaintext_private_key_update
  BEFORE UPDATE ON public.crypto_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_no_plaintext_private_key();

-- Add comment explaining the security measure
COMMENT ON FUNCTION public.validate_no_plaintext_private_key() IS 
  'Security function that prevents storing plaintext private keys. Only encrypted keys (private_key_encrypted) are allowed.';

-- Update the deprecated private_key column comment to emphasize it should never be used
COMMENT ON COLUMN public.crypto_wallets.private_key IS 
  'DEPRECATED: Plain text private key - DO NOT USE. This column is blocked by database triggers. Use private_key_encrypted instead.';










