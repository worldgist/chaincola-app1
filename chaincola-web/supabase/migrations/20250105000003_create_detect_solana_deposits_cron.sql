-- Create cron job to detect Solana deposits
-- Runs every 1 minute to check for new Solana deposits and credit balances

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-solana-deposits') THEN
    PERFORM cron.unschedule('detect-solana-deposits');
  END IF;
END $$;

-- Create the cron job with hardcoded URL and service role key
SELECT cron.schedule(
  'detect-solana-deposits',
  '* * * * *', -- Every 1 minute
  $$
  SELECT
    net.http_post(
      url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-solana-deposits',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);









