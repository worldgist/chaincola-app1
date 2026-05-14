-- Remove treasury / on-chain reconciliation stack (tables + engine functions).
-- Keeps public.system_wallets, public.reconciliations (control-center), public.bank_reconciliation.
-- Replaces a few RPCs with no-op / system_wallets-only stubs so existing edge code does not hard-fail.

-- ---------------------------------------------------------------------------
-- Cron: stop calling reconciliation-engine
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automated-treasury-reconciliation') THEN
    PERFORM cron.unschedule('automated-treasury-reconciliation');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers on system_wallets (treasury reconciliation refresh)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_reconciliation_on_wallet_change ON public.system_wallets;
DROP FUNCTION IF EXISTS public.trigger_update_reconciliation_on_wallet_change();

-- ---------------------------------------------------------------------------
-- Functions that reference tables we are dropping (order: dependents first)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.calculate_treasury_health_score(text);
DROP FUNCTION IF EXISTS public.generate_reconciliation_report(date, date, uuid);
DROP FUNCTION IF EXISTS public.force_reconciliation(text, text, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.force_reconciliation(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.resolve_discrepancy(text, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_available_liquidity(text);
DROP FUNCTION IF EXISTS public.create_treasury_alert(text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.check_balance_threshold(text, numeric);
DROP FUNCTION IF EXISTS public.update_on_chain_balance(text, text, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.update_reconciliation_status(text, numeric, numeric);
DROP FUNCTION IF EXISTS public.check_and_create_risk_alerts(text, text, boolean, boolean, boolean, numeric, numeric);

-- update_treasury_wallet_addresses_updated_at is used by a trigger on treasury_wallet_addresses;
-- drop that table first (below), then drop the function.

-- ---------------------------------------------------------------------------
-- Tables (children / dependents first)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.reconciliation_errors CASCADE;
DROP TABLE IF EXISTS public.reconciliation_logs CASCADE;
DROP TABLE IF EXISTS public.reconciliation_runs CASCADE;
DROP TABLE IF EXISTS public.treasury_wallet_balances CASCADE;
DROP TABLE IF EXISTS public.treasury_wallet_addresses CASCADE;
DROP FUNCTION IF EXISTS public.update_treasury_wallet_addresses_updated_at();
DROP TABLE IF EXISTS public.treasury_risk_alerts CASCADE;
DROP TABLE IF EXISTS public.treasury_reports CASCADE;
DROP TABLE IF EXISTS public.treasury_alerts CASCADE;
DROP TABLE IF EXISTS public.treasury_permissions CASCADE;
DROP TABLE IF EXISTS public.user_treasury_roles CASCADE;
DROP TABLE IF EXISTS public.liquidity_controls CASCADE;
DROP TABLE IF EXISTS public.treasury_threshold_rules CASCADE;
DROP TABLE IF EXISTS public.on_chain_balances CASCADE;
DROP TABLE IF EXISTS public.treasury_reconciliation_status CASCADE;
DROP TABLE IF EXISTS public.reconciliation_history CASCADE;
DROP TABLE IF EXISTS public.treasury_wallets CASCADE;

-- ---------------------------------------------------------------------------
-- Stubs: same names/signatures used by remaining edge functions / clients
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_available_liquidity(p_asset text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jb jsonb;
  k text;
  v numeric;
BEGIN
  SELECT to_jsonb(sw) INTO jb FROM public.system_wallets sw WHERE sw.id = 1;
  IF jb IS NULL THEN
    RETURN 0;
  END IF;
  k := lower(trim(p_asset));
  IF k = 'ngn' THEN
    v := (jb ->> 'ngn_float_balance')::numeric;
  ELSE
    v := (jb ->> (k || '_inventory'))::numeric;
  END IF;
  IF v IS NULL THEN
    RETURN 0;
  END IF;
  RETURN greatest(v, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_balance_threshold(p_asset text, p_current_balance numeric)
RETURNS TABLE (
  is_below_minimum boolean,
  is_below_critical boolean,
  should_disable_trading boolean,
  threshold_rule jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false, false, false, '{}'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.create_treasury_alert(
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_asset text DEFAULT NULL::text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gen_random_uuid();
$$;

CREATE OR REPLACE FUNCTION public.update_on_chain_balance(
  p_asset text,
  p_wallet_address text,
  p_on_chain_balance numeric,
  p_ledger_inventory numeric DEFAULT NULL::numeric,
  p_fetch_error text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status',
    CASE
      WHEN p_fetch_error IS NOT NULL AND btrim(p_fetch_error) <> '' THEN 'ERROR'
      ELSE 'OK'
    END,
    'asset',
    p_asset,
    'on_chain_balance',
    p_on_chain_balance,
    'ledger_inventory',
    p_ledger_inventory
  );
$$;

CREATE OR REPLACE FUNCTION public.update_reconciliation_status(
  p_asset text,
  p_ledger_balance numeric DEFAULT NULL::numeric,
  p_on_chain_balance numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'asset', p_asset,
    'ledger_balance', p_ledger_balance,
    'on_chain_balance', p_on_chain_balance,
    'note', 'treasury reconciliation stack removed; stub only'
  );
$$;

CREATE OR REPLACE FUNCTION public.force_reconciliation(
  p_asset text,
  p_reconciliation_method text DEFAULT 'MANUAL_FORCE_SYNC'::text,
  p_initiated_by uuid DEFAULT NULL::uuid,
  p_resolution_action text DEFAULT NULL::text,
  p_resolution_notes text DEFAULT NULL::text,
  p_auto_resolve boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', false,
    'asset', p_asset,
    'message', 'Treasury reconciliation stack removed; no-op RPC'
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_reconciliation_report(
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_generated_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', false,
    'message', 'Treasury reconciliation stack removed; no-op RPC',
    'start_date', p_start_date,
    'end_date', p_end_date
  );
$$;

CREATE OR REPLACE FUNCTION public.calculate_treasury_health_score(p_asset text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'asset', p_asset,
    'score', NULL::numeric,
    'message', 'Treasury reconciliation stack removed; no-op RPC'
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_discrepancy(
  p_asset text,
  p_resolution_action text,
  p_resolution_notes text,
  p_transaction_hash text DEFAULT NULL::text,
  p_adjustment_id uuid DEFAULT NULL::uuid,
  p_resolved_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', false,
    'asset', p_asset,
    'message', 'Treasury reconciliation stack removed; no-op RPC'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_available_liquidity(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_balance_threshold(text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_treasury_alert(text, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_on_chain_balance(text, text, numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_reconciliation_status(text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_reconciliation(text, text, uuid, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_reconciliation_report(date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_treasury_health_score(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_discrepancy(text, text, text, text, uuid, uuid) TO authenticated, service_role;
