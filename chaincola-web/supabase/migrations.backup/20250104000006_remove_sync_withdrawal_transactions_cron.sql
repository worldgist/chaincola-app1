-- Remove cron job for syncing withdrawal transactions
-- Transactions will now be created immediately when withdrawal is completed or failed

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-withdrawal-transactions') THEN
    PERFORM cron.unschedule('sync-withdrawal-transactions');
    RAISE NOTICE 'Cron job sync-withdrawal-transactions has been removed';
  ELSE
    RAISE NOTICE 'Cron job sync-withdrawal-transactions does not exist';
  END IF;
END $$;









