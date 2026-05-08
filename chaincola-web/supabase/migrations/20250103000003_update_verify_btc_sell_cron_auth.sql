-- Update verify-btc-sell cron job to use hardcoded service role key
-- This ensures the cron job can authenticate properly

DO $$
BEGIN
  -- Unschedule existing job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-btc-sell-transactions') THEN
    PERFORM cron.unschedule('verify-btc-sell-transactions');
  END IF;
END $$;

-- Recreate the cron job with hardcoded service role key
SELECT cron.schedule(
  'verify-btc-sell-transactions',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-btc-sell',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);










