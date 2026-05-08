-- Recreate pg_cron Edge Function invocations to use Vault for the service_role JWT
-- (embedded tokens in older migrations were issued for the previous project ref and return 401.)
--
-- One-time setup (Supabase SQL editor), before or after this migration:
--   SELECT vault.create_secret('<paste service_role JWT from Dashboard → Settings → API>', 'supabase_service_role_jwt');
-- If the secret is missing, jobs still run but Authorization is invalid until the secret exists.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.edge_function_request_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization',
    'Bearer ' || coalesce(
      (
        SELECT ds.decrypted_secret
        FROM vault.decrypted_secrets ds
        WHERE ds.name = 'supabase_service_role_jwt'
        ORDER BY ds.id DESC
        LIMIT 1
      ),
      ''
    )
  );
$$;

REVOKE ALL ON FUNCTION private.edge_function_request_headers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.edge_function_request_headers() TO postgres;

-- Unschedule known jobs (idempotent)
DO $$
DECLARE
  j text;
  jobs text[] := ARRAY[
    'verify-pending-flutterwave-payments',
    'verify-luno-buy-transactions',
    'sync-withdrawal-transactions',
    'detect-ethereum-deposits',
    'verify-btc-sell-transactions',
    'verify-eth-sell-transactions',
    'verify-sol-sell-transactions',
    'verify-usdt-sell-transactions',
    'verify-usdc-sell-transactions',
    'verify-ethereum-send-transactions',
    'verify-tron-send-transactions',
    'detect-tron-deposits',
    'detect-solana-deposits',
    'execute-luno-sell-when-btc-credited',
    'detect-bitcoin-deposits',
    'detect-xrp-deposits',
    'detect-usdt-deposits',
    'detect-usdc-deposits',
    'auto-sweep-engine',
    'automated-treasury-reconciliation',
    'check-crypto-price-alerts'
  ];
BEGIN
  FOREACH j IN ARRAY jobs
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule(
  'verify-pending-flutterwave-payments',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-pending-flutterwave-payments',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-luno-buy-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-luno-buy-transactions',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'sync-withdrawal-transactions',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/sync-withdrawal-transactions',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-ethereum-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-ethereum-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-btc-sell-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-btc-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-eth-sell-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-eth-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-sol-sell-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-sol-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-usdt-sell-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-usdt-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-usdc-sell-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-usdc-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-ethereum-send-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-ethereum-send-transactions',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'verify-tron-send-transactions',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-tron-transaction',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-tron-deposits',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-tron-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-solana-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-solana-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'execute-luno-sell-when-btc-credited',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/verify-btc-sell',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-bitcoin-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-bitcoin-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-xrp-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-xrp-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-usdt-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-usdt-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'detect-usdc-deposits',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/detect-usdc-deposits',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'auto-sweep-engine',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/auto-sweep-engine',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'automated-treasury-reconciliation',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/reconciliation-engine',
    headers := private.edge_function_request_headers(),
    body := jsonb_build_object(
      'action', 'autoReconcile',
      'tolerance_percentage', 0.01
    )
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'check-crypto-price-alerts',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://woyvzsysasgvpigaflul.supabase.co/functions/v1/check-crypto-price-alerts',
    headers := private.edge_function_request_headers(),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
