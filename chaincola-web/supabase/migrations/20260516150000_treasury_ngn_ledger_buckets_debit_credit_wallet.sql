-- Treasury NGN bucket balances + append-only ledger, wired into debit_wallet / credit_wallet
-- for withdrawal splits (payout reserve vs fee). Admin can move NGN between buckets.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.treasury_ngn_bucket_balances (
  bucket_code text PRIMARY KEY,
  balance numeric(20, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treasury_ngn_bucket_code_chk CHECK (
    bucket_code IN ('PAYOUT_RESERVE', 'FEE_REVENUE', 'OPERATING_FLOAT')
  ),
  CONSTRAINT treasury_ngn_bucket_balance_non_negative CHECK (balance >= 0)
);

INSERT INTO public.treasury_ngn_bucket_balances (bucket_code, balance)
VALUES
  ('PAYOUT_RESERVE', 0),
  ('FEE_REVENUE', 0),
  ('OPERATING_FLOAT', 0)
ON CONFLICT (bucket_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.treasury_ngn_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  bucket_code text NOT NULL REFERENCES public.treasury_ngn_bucket_balances (bucket_code) ON UPDATE CASCADE,
  delta numeric(20, 2) NOT NULL,
  balance_after numeric(20, 2) NOT NULL,
  category text NOT NULL,
  reference_type text,
  reference_id uuid,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_treasury_ngn_ledger_created_at ON public.treasury_ngn_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_ngn_ledger_ref ON public.treasury_ngn_ledger (reference_type, reference_id);

COMMENT ON TABLE public.treasury_ngn_bucket_balances IS
  'Operational NGN buckets: bank payout reserve, fee revenue, general operating float.';
COMMENT ON TABLE public.treasury_ngn_ledger IS
  'Append-only treasury NGN journal; deltas update bucket balances atomically.';

-- ---------------------------------------------------------------------------
-- Internal: apply one ledger line + bucket balance (no direct EXECUTE for clients)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._treasury_ngn_apply_delta(
  p_bucket_code text,
  p_delta numeric,
  p_category text,
  p_reference_type text,
  p_reference_id uuid,
  p_user_id uuid,
  p_metadata jsonb,
  p_created_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev numeric(20, 2);
  v_next numeric(20, 2);
BEGIN
  IF p_bucket_code IS NULL OR p_bucket_code NOT IN ('PAYOUT_RESERVE', 'FEE_REVENUE', 'OPERATING_FLOAT') THEN
    RAISE EXCEPTION 'invalid treasury bucket: %', p_bucket_code;
  END IF;
  IF p_delta IS NULL OR round(p_delta, 2) = 0 THEN
    RETURN;
  END IF;

  SELECT b.balance
  INTO v_prev
  FROM public.treasury_ngn_bucket_balances b
  WHERE b.bucket_code = p_bucket_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'treasury bucket not found: %', p_bucket_code;
  END IF;

  v_next := round(v_prev + p_delta, 2);
  IF v_next < 0 THEN
    RAISE EXCEPTION 'treasury bucket % would go negative (have %, delta %)', p_bucket_code, v_prev, p_delta;
  END IF;

  UPDATE public.treasury_ngn_bucket_balances
  SET balance = v_next,
      updated_at = now()
  WHERE bucket_code = p_bucket_code;

  INSERT INTO public.treasury_ngn_ledger (
    bucket_code,
    delta,
    balance_after,
    category,
    reference_type,
    reference_id,
    user_id,
    metadata,
    created_by
  )
  VALUES (
    p_bucket_code,
    round(p_delta, 2),
    v_next,
    p_category,
    p_reference_type,
    p_reference_id,
    p_user_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public._treasury_ngn_apply_delta(text, numeric, text, text, uuid, uuid, jsonb, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Replace debit_wallet / credit_wallet (drop old 3-arg signatures)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.debit_wallet(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.debit_wallet(uuid, double precision, text);
DROP FUNCTION IF EXISTS public.credit_wallet(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.credit_wallet(uuid, double precision, text);

CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id uuid,
  p_amount numeric(20, 2),
  p_currency text DEFAULT 'NGN',
  p_ledger_ref_type text DEFAULT NULL,
  p_ledger_ref_id uuid DEFAULT NULL,
  p_ledger_payout_amount numeric(20, 2) DEFAULT NULL,
  p_ledger_fee_amount numeric(20, 2) DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uw_balance  numeric(20, 2) := 0;
  v_w_balance   numeric(20, 2) := 0;
  v_wb_balance  numeric(20, 2) := 0;
  v_current     numeric(20, 2) := 0;
  v_new_balance numeric(20, 2) := 0;
  v_sum_split   numeric(20, 2);
BEGIN
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'debit amount must be greater than 0';
  END IF;

  PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF p_currency = 'NGN' THEN
    PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.user_wallets (user_id) VALUES (p_user_id)
      ON CONFLICT (user_id) DO NOTHING;
      PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
    END IF;
  END IF;

  IF p_currency = 'NGN' THEN
    SELECT coalesce(ngn_balance, 0) INTO v_uw_balance FROM public.user_wallets WHERE user_id = p_user_id;
    SELECT coalesce(ngn_balance, 0) INTO v_w_balance FROM public.wallets WHERE user_id = p_user_id;
  ELSE
    v_uw_balance := 0;
    SELECT coalesce(usd_balance, 0) INTO v_w_balance FROM public.wallets WHERE user_id = p_user_id;
  END IF;

  BEGIN
    SELECT coalesce(balance, 0) INTO v_wb_balance
    FROM public.wallet_balances
    WHERE user_id = p_user_id AND currency = p_currency;
  EXCEPTION
    WHEN undefined_table THEN
      v_wb_balance := 0;
  END;

  v_current := greatest(coalesce(v_uw_balance, 0), coalesce(v_w_balance, 0), coalesce(v_wb_balance, 0));

  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current, p_amount;
  END IF;

  v_new_balance := round(v_current - p_amount, 2);

  UPDATE public.wallets
  SET
    ngn_balance = CASE WHEN p_currency = 'NGN' THEN v_new_balance ELSE ngn_balance END,
    usd_balance = CASE WHEN p_currency = 'USD' THEN v_new_balance ELSE usd_balance END,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF p_currency = 'NGN' THEN
    UPDATE public.user_wallets
    SET ngn_balance = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  BEGIN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_currency, v_new_balance, now())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = excluded.balance, updated_at = excluded.updated_at;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  -- Treasury journal (NGN withdrawals only): split payout vs fee into buckets
  IF p_currency = 'NGN'
     AND lower(trim(coalesce(p_ledger_ref_type, ''))) = 'withdrawal'
     AND p_ledger_ref_id IS NOT NULL
     AND p_ledger_payout_amount IS NOT NULL
     AND p_ledger_fee_amount IS NOT NULL
  THEN
    v_sum_split := round(coalesce(p_ledger_payout_amount, 0) + coalesce(p_ledger_fee_amount, 0), 2);
    IF v_sum_split <> round(p_amount, 2) THEN
      RAISE EXCEPTION 'ledger payout+fee (%) must equal debit amount (%)', v_sum_split, round(p_amount, 2);
    END IF;
    IF p_ledger_payout_amount < 0 OR p_ledger_fee_amount < 0 THEN
      RAISE EXCEPTION 'ledger payout and fee must be non-negative';
    END IF;

    PERFORM public._treasury_ngn_apply_delta(
      'PAYOUT_RESERVE',
      p_ledger_payout_amount,
      'WITHDRAWAL_DEBIT_USER_PAYOUT',
      'withdrawal',
      p_ledger_ref_id,
      p_user_id,
      jsonb_build_object(
        'wallet_debit_total', p_amount,
        'payout', p_ledger_payout_amount,
        'fee', p_ledger_fee_amount
      ),
      auth.uid()
    );

    PERFORM public._treasury_ngn_apply_delta(
      'FEE_REVENUE',
      p_ledger_fee_amount,
      'WITHDRAWAL_DEBIT_USER_FEE',
      'withdrawal',
      p_ledger_ref_id,
      p_user_id,
      jsonb_build_object(
        'wallet_debit_total', p_amount,
        'payout', p_ledger_payout_amount,
        'fee', p_ledger_fee_amount
      ),
      auth.uid()
    );
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid,
  p_amount numeric(20, 2),
  p_currency text DEFAULT 'NGN',
  p_ledger_ref_type text DEFAULT NULL,
  p_ledger_ref_id uuid DEFAULT NULL,
  p_ledger_payout_amount numeric(20, 2) DEFAULT NULL,
  p_ledger_fee_amount numeric(20, 2) DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uw_balance  numeric(20, 2) := 0;
  v_w_balance   numeric(20, 2) := 0;
  v_wb_balance  numeric(20, 2) := 0;
  v_current     numeric(20, 2) := 0;
  v_new_balance numeric(20, 2) := 0;
  v_sum_split   numeric(20, 2);
BEGIN
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'credit amount must be greater than 0';
  END IF;

  PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF p_currency = 'NGN' THEN
    PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.user_wallets (user_id) VALUES (p_user_id)
      ON CONFLICT (user_id) DO NOTHING;
      PERFORM 1 FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
    END IF;
  END IF;

  IF p_currency = 'NGN' THEN
    SELECT coalesce(ngn_balance, 0) INTO v_uw_balance FROM public.user_wallets WHERE user_id = p_user_id;
    SELECT coalesce(ngn_balance, 0) INTO v_w_balance FROM public.wallets WHERE user_id = p_user_id;
  ELSE
    v_uw_balance := 0;
    SELECT coalesce(usd_balance, 0) INTO v_w_balance FROM public.wallets WHERE user_id = p_user_id;
  END IF;

  BEGIN
    SELECT coalesce(balance, 0) INTO v_wb_balance
    FROM public.wallet_balances
    WHERE user_id = p_user_id AND currency = p_currency;
  EXCEPTION
    WHEN undefined_table THEN
      v_wb_balance := 0;
  END;

  v_current := greatest(coalesce(v_uw_balance, 0), coalesce(v_w_balance, 0), coalesce(v_wb_balance, 0));
  v_new_balance := round(v_current + p_amount, 2);

  UPDATE public.wallets
  SET
    ngn_balance = CASE WHEN p_currency = 'NGN' THEN v_new_balance ELSE ngn_balance END,
    usd_balance = CASE WHEN p_currency = 'USD' THEN v_new_balance ELSE usd_balance END,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF p_currency = 'NGN' THEN
    UPDATE public.user_wallets
    SET ngn_balance = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  BEGIN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_currency, v_new_balance, now())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = excluded.balance, updated_at = excluded.updated_at;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  -- Reverse treasury buckets after user is credited (whole txn rolls back if buckets insufficient)
  IF p_currency = 'NGN'
     AND lower(trim(coalesce(p_ledger_ref_type, ''))) = 'withdrawal'
     AND p_ledger_ref_id IS NOT NULL
     AND p_ledger_payout_amount IS NOT NULL
     AND p_ledger_fee_amount IS NOT NULL
  THEN
    v_sum_split := round(coalesce(p_ledger_payout_amount, 0) + coalesce(p_ledger_fee_amount, 0), 2);
    IF v_sum_split <> round(p_amount, 2) THEN
      RAISE EXCEPTION 'ledger payout+fee (%) must equal credit amount (%)', v_sum_split, round(p_amount, 2);
    END IF;

    PERFORM public._treasury_ngn_apply_delta(
      'PAYOUT_RESERVE',
      -p_ledger_payout_amount,
      'WITHDRAWAL_REFUND_PAYOUT',
      'withdrawal',
      p_ledger_ref_id,
      p_user_id,
      jsonb_build_object(
        'wallet_credit_total', p_amount,
        'payout', p_ledger_payout_amount,
        'fee', p_ledger_fee_amount
      ),
      auth.uid()
    );

    PERFORM public._treasury_ngn_apply_delta(
      'FEE_REVENUE',
      -p_ledger_fee_amount,
      'WITHDRAWAL_REFUND_FEE',
      'withdrawal',
      p_ledger_ref_id,
      p_user_id,
      jsonb_build_object(
        'wallet_credit_total', p_amount,
        'payout', p_ledger_payout_amount,
        'fee', p_ledger_fee_amount
      ),
      auth.uid()
    );
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text, text, uuid, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text, uuid, numeric, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.debit_wallet(uuid, numeric, text, text, uuid, numeric, numeric) IS
  'Debits user fiat wallet; optional withdrawal ledger splits NGN into PAYOUT_RESERVE + FEE_REVENUE.';
COMMENT ON FUNCTION public.credit_wallet(uuid, numeric, text, text, uuid, numeric, numeric) IS
  'Credits user fiat wallet; optional withdrawal ledger reverses treasury buckets after credit (txn atomic).';

-- ---------------------------------------------------------------------------
-- Admin: move NGN between treasury buckets (manual allocation)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_treasury_ngn_move_between_buckets(
  p_from_bucket text,
  p_to_bucket text,
  p_amount numeric(20, 2),
  p_note text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean := false;
  v_ref uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.is_admin IS TRUE
  )
  INTO v_admin;

  IF NOT v_admin THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_from_bucket IS NULL OR p_to_bucket IS NULL OR p_from_bucket = p_to_bucket THEN
    RAISE EXCEPTION 'invalid buckets';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_from_bucket NOT IN ('PAYOUT_RESERVE', 'FEE_REVENUE', 'OPERATING_FLOAT')
     OR p_to_bucket NOT IN ('PAYOUT_RESERVE', 'FEE_REVENUE', 'OPERATING_FLOAT')
  THEN
    RAISE EXCEPTION 'invalid bucket code';
  END IF;

  PERFORM public._treasury_ngn_apply_delta(
    p_from_bucket,
    -p_amount,
    'ADMIN_BUCKET_TRANSFER_OUT',
    'admin_transfer',
    v_ref,
    NULL,
    jsonb_build_object('to_bucket', p_to_bucket, 'note', coalesce(p_note, '')),
    auth.uid()
  );

  PERFORM public._treasury_ngn_apply_delta(
    p_to_bucket,
    p_amount,
    'ADMIN_BUCKET_TRANSFER_IN',
    'admin_transfer',
    v_ref,
    NULL,
    jsonb_build_object('from_bucket', p_from_bucket, 'note', coalesce(p_note, '')),
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_treasury_ngn_move_between_buckets(text, text, numeric, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_treasury_ngn_move_between_buckets(text, text, numeric, text) IS
  'Moves NGN between treasury buckets (admin only). Creates paired ledger rows.';

-- ---------------------------------------------------------------------------
-- RLS: admins read; no direct writes (mutations via RPC + debit/credit_wallet)
-- ---------------------------------------------------------------------------

ALTER TABLE public.treasury_ngn_bucket_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_ngn_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treasury_ngn_buckets_admin_select" ON public.treasury_ngn_bucket_balances;
CREATE POLICY "treasury_ngn_buckets_admin_select"
  ON public.treasury_ngn_bucket_balances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.is_admin IS TRUE
    )
  );

DROP POLICY IF EXISTS "treasury_ngn_ledger_admin_select" ON public.treasury_ngn_ledger;
CREATE POLICY "treasury_ngn_ledger_admin_select"
  ON public.treasury_ngn_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.is_admin IS TRUE
    )
  );

GRANT SELECT ON TABLE public.treasury_ngn_bucket_balances TO authenticated;
GRANT SELECT ON TABLE public.treasury_ngn_ledger TO authenticated;
