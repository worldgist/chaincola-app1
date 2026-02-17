-- Create cron job to detect USDT deposits
-- Runs every 1 minute to check for new USDT deposits and auto-convert to NGN

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension if not already enabled (for net.http_post)
CREATE EXTENSION IF NOT EXISTS http;

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-usdt-deposits') THEN
    PERFORM cron.unschedule('detect-usdt-deposits');
  END IF;
END $$;

-- Create the cron job with hardcoded URL and service role key
SELECT cron.schedule(
  'detect-usdt-deposits',
  '* * * * *', -- Every 1 minute
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/detect-usdt-deposits',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled jobs for detecting USDT deposits and auto-converting to NGN';
