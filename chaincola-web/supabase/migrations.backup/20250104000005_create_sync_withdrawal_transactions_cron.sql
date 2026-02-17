-- Create cron job to sync withdrawal transaction statuses
-- Runs every 1 minute to update transaction statuses based on withdrawal status
-- This ensures transaction history shows correct status even if the trigger fails

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-withdrawal-transactions') THEN
    PERFORM cron.unschedule('sync-withdrawal-transactions');
  END IF;
END $$;

-- Create the cron job with hardcoded URL and service role key
SELECT cron.schedule(
  'sync-withdrawal-transactions',
  '* * * * *', -- Every 1 minute
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/sync-withdrawal-transactions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled jobs for syncing withdrawal transaction statuses';









