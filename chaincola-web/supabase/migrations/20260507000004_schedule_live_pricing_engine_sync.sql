-- Keep pricing_engine_config live by scheduling sync-live-pricing-engine Edge Function.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-live-pricing-engine') THEN
    PERFORM cron.unschedule('sync-live-pricing-engine');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-live-pricing-engine',
  '*/3 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/sync-live-pricing-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveXZ6c3lzYXNndnBpZ2FmbHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTkzMzAsImV4cCI6MjA5MzQzNTMzMH0.lBaJkSAQ47tnWtJrCQHDJQTbEw9dOTfJNFq-7QCmf3c',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveXZ6c3lzYXNndnBpZ2FmbHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTkzMzAsImV4cCI6MjA5MzQzNTMzMH0.lBaJkSAQ47tnWtJrCQHDJQTbEw9dOTfJNFq-7QCmf3c'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
