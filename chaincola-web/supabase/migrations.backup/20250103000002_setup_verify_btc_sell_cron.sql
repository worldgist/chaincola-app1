-- Set up cron job to periodically verify BTC sell transactions
-- This runs every 2 minutes to check pending sells and update their status

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing cron job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-btc-sell-transactions') THEN
    PERFORM cron.unschedule('verify-btc-sell-transactions');
  END IF;
END $$;

-- Create the cron job with hardcoded URL and service role key
SELECT cron.schedule(
  'verify-btc-sell-transactions',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/verify-btc-sell',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Alternative: Use Supabase's built-in cron (if available)
-- Note: This requires Supabase Pro plan or higher
-- You can also set this up manually in the Supabase Dashboard:
-- 1. Go to Database > Cron Jobs
-- 2. Create a new cron job
-- 3. Name: verify-btc-sell-transactions
-- 4. Schedule: */2 * * * * (every 2 minutes)
-- 5. Command: SELECT net.http_post(...) as above

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled jobs for verifying BTC sell transactions';

