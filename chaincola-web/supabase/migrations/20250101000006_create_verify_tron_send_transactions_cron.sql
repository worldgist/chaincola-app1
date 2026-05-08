-- Create cron job to verify pending TRON SEND transactions
-- Runs every 2 minutes to check transaction status and update from PENDING to COMPLETED

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-tron-send-transactions') THEN
    PERFORM cron.unschedule('verify-tron-send-transactions');
  END IF;
END $$;

-- Create the cron job with hardcoded URL and service role key
SELECT cron.schedule(
  'verify-tron-send-transactions',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-tron-transaction',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);











