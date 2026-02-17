-- Create cron job for crypto price alerts checking
-- Runs every 3 minutes to fetch prices from Alchemy and check user alerts

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http;

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-crypto-price-alerts') THEN
    PERFORM cron.unschedule('check-crypto-price-alerts');
  END IF;
END $$;

-- Create the cron job for checking crypto price alerts
-- Runs every 3 minutes (between 2-5 minutes as recommended)
-- NOTE: Replace the service role key below with your actual SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'check-crypto-price-alerts',
  '*/3 * * * *', -- Every 3 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/check-crypto-price-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled crypto price alerts checking every 3 minutes';
