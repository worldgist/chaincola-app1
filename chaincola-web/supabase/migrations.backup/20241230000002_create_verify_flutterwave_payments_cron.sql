-- Create cron job to verify pending Flutterwave payments
-- Runs every 2 minutes to check and verify pending payments
--
-- IMPORTANT: Replace 'YOUR_SERVICE_ROLE_KEY_HERE' with your actual service role key
-- Get it from: https://supabase.com/dashboard/project/slleojsdpctxhlsoyenr/settings/api
-- Look for "service_role" key (starts with eyJ...)

-- Unschedule if exists, then reschedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-pending-flutterwave-payments') THEN
    PERFORM cron.unschedule('verify-pending-flutterwave-payments');
  END IF;
END $$;

-- Create the cron job
SELECT cron.schedule(
  'verify-pending-flutterwave-payments',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/verify-pending-flutterwave-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

