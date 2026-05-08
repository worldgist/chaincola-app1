-- Verify instant_buy_crypto function exists and check its definition
-- This migration verifies the function was created correctly

-- Check if function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'instant_buy_crypto' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'Function instant_buy_crypto does not exist';
  END IF;
  
  RAISE NOTICE 'Function instant_buy_crypto exists and is ready to use';
END $$;

-- Verify function signature
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc 
WHERE proname = 'instant_buy_crypto';
