-- Remove all cron jobs for crypto deposit detection functions
-- These functions have been deleted

DO $$
BEGIN
  -- Remove detect-ethereum-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-ethereum-deposits') THEN
    PERFORM cron.unschedule('detect-ethereum-deposits');
  END IF;

  -- Remove detect-bitcoin-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-bitcoin-deposits') THEN
    PERFORM cron.unschedule('detect-bitcoin-deposits');
  END IF;

  -- Remove detect-solana-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-solana-deposits') THEN
    PERFORM cron.unschedule('detect-solana-deposits');
  END IF;

  -- Remove detect-xrp-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-xrp-deposits') THEN
    PERFORM cron.unschedule('detect-xrp-deposits');
  END IF;

  -- Remove detect-polygon-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-polygon-deposits') THEN
    PERFORM cron.unschedule('detect-polygon-deposits');
  END IF;

  -- Remove detect-tron-deposits cron job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-tron-deposits') THEN
    PERFORM cron.unschedule('detect-tron-deposits');
  END IF;

  -- Remove check-incoming-deposits cron job (if exists)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-incoming-deposits') THEN
    PERFORM cron.unschedule('check-incoming-deposits');
  END IF;

  -- Remove process-missing-deposit cron job (if exists)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-missing-deposit') THEN
    PERFORM cron.unschedule('process-missing-deposit');
  END IF;

  -- Remove force-sync-eth-deposits cron job (if exists)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'force-sync-eth-deposits') THEN
    PERFORM cron.unschedule('force-sync-eth-deposits');
  END IF;

  -- Remove manual-sync-eth-balance cron job (if exists)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'manual-sync-eth-balance') THEN
    PERFORM cron.unschedule('manual-sync-eth-balance');
  END IF;
END $$;
