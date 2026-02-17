-- Automated Reconciliation Engine
-- Runs scheduled reconciliation checks and auto-resolves small tolerances

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http;

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automated-treasury-reconciliation') THEN
    PERFORM cron.unschedule('automated-treasury-reconciliation');
  END IF;
END $$;

-- Create the cron job for automated reconciliation
-- Runs every 15 minutes
SELECT cron.schedule(
  'automated-treasury-reconciliation',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://slleojsdpctxhlsoyenr.supabase.co/functions/v1/treasury-reconciliation-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA'
      ),
      body := jsonb_build_object(
        'action', 'autoReconcile',
        'tolerance_percentage', 0.01 -- Auto-resolve discrepancies < 0.01%
      )
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled automated treasury reconciliation every 15 minutes';
