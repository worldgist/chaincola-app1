-- Drop crypto_rates table and all related functions
-- This removes the admin rate management system

-- Drop all functions that depend on crypto_rates first
DO $$ 
DECLARE
  r RECORD;
BEGIN
  -- Drop all overloads of set_crypto_rate
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'set_crypto_rate' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;

  -- Drop all overloads of get_all_crypto_rates
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'get_all_crypto_rates' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;

  -- Drop all overloads of get_active_crypto_rate
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'get_active_crypto_rate' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;

  -- Drop toggle_crypto_rate_status function
  FOR r IN 
    SELECT oid::regprocedure 
    FROM pg_proc 
    WHERE proname = 'toggle_crypto_rate_status' 
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS update_crypto_rates_updated_at ON public.crypto_rates;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.update_crypto_rates_updated_at() CASCADE;

-- Drop the table (this will also drop all RLS policies)
DROP TABLE IF EXISTS public.crypto_rates CASCADE;
