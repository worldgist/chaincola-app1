-- Remove admin pricing_engine_config table, RPCs, trigger function, and pg_cron job for sync-live-pricing-engine.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-live-pricing-engine') THEN
      PERFORM cron.unschedule('sync-live-pricing-engine');
    END IF;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS rp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'set_pricing_engine_config',
        'get_pricing_engine_config',
        'get_all_pricing_engine_configs',
        'update_pricing_engine_config_updated_at'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn.rp::text || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.pricing_engine_config CASCADE;
