-- Follow-up to 20260508000001: the `user_wallets` table does NOT have a
-- `usd_balance` column (only ngn_balance + per-coin columns), so the previous
-- migration aborted with `column "usd_balance" does not exist` whenever it was
-- called. This rewrite only touches user_wallets for NGN; USD stays in
-- wallets + wallet_balances only.

CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id UUID,
  p_amount DECIMAL(20, 2),
  p_currency TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uw_balance  DECIMAL(20, 2) := 0;
  v_w_balance   DECIMAL(20, 2) := 0;
  v_wb_balance  DECIMAL(20, 2) := 0;
  v_current     DECIMAL(20, 2) := 0;
  v_new_balance DECIMAL(20, 2) := 0;
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
    SELECT COALESCE(ngn_balance, 0) INTO v_uw_balance FROM public.user_wallets WHERE user_id = p_user_id;
    SELECT COALESCE(ngn_balance, 0) INTO v_w_balance  FROM public.wallets       WHERE user_id = p_user_id;
  ELSE
    v_uw_balance := 0;
    SELECT COALESCE(usd_balance, 0) INTO v_w_balance  FROM public.wallets       WHERE user_id = p_user_id;
  END IF;

  BEGIN
    SELECT COALESCE(balance, 0) INTO v_wb_balance
      FROM public.wallet_balances
      WHERE user_id = p_user_id AND currency = p_currency;
  EXCEPTION WHEN undefined_table THEN
    v_wb_balance := 0;
  END;

  v_current := GREATEST(COALESCE(v_uw_balance,0), COALESCE(v_w_balance,0), COALESCE(v_wb_balance,0));

  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current, p_amount;
  END IF;

  v_new_balance := ROUND(v_current - p_amount, 2);

  UPDATE public.wallets
  SET
    ngn_balance = CASE WHEN p_currency = 'NGN' THEN v_new_balance ELSE ngn_balance END,
    usd_balance = CASE WHEN p_currency = 'USD' THEN v_new_balance ELSE usd_balance END,
    updated_at  = NOW()
  WHERE user_id = p_user_id;

  IF p_currency = 'NGN' THEN
    UPDATE public.user_wallets
    SET ngn_balance = v_new_balance,
        updated_at  = NOW()
    WHERE user_id = p_user_id;
  END IF;

  BEGIN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_currency, v_new_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id UUID,
  p_amount DECIMAL(20, 2),
  p_currency TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uw_balance  DECIMAL(20, 2) := 0;
  v_w_balance   DECIMAL(20, 2) := 0;
  v_wb_balance  DECIMAL(20, 2) := 0;
  v_current     DECIMAL(20, 2) := 0;
  v_new_balance DECIMAL(20, 2) := 0;
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
    SELECT COALESCE(ngn_balance, 0) INTO v_uw_balance FROM public.user_wallets WHERE user_id = p_user_id;
    SELECT COALESCE(ngn_balance, 0) INTO v_w_balance  FROM public.wallets       WHERE user_id = p_user_id;
  ELSE
    v_uw_balance := 0;
    SELECT COALESCE(usd_balance, 0) INTO v_w_balance  FROM public.wallets       WHERE user_id = p_user_id;
  END IF;

  BEGIN
    SELECT COALESCE(balance, 0) INTO v_wb_balance
      FROM public.wallet_balances
      WHERE user_id = p_user_id AND currency = p_currency;
  EXCEPTION WHEN undefined_table THEN
    v_wb_balance := 0;
  END;

  v_current := GREATEST(COALESCE(v_uw_balance,0), COALESCE(v_w_balance,0), COALESCE(v_wb_balance,0));
  v_new_balance := ROUND(v_current + p_amount, 2);

  UPDATE public.wallets
  SET
    ngn_balance = CASE WHEN p_currency = 'NGN' THEN v_new_balance ELSE ngn_balance END,
    usd_balance = CASE WHEN p_currency = 'USD' THEN v_new_balance ELSE usd_balance END,
    updated_at  = NOW()
  WHERE user_id = p_user_id;

  IF p_currency = 'NGN' THEN
    UPDATE public.user_wallets
    SET ngn_balance = v_new_balance,
        updated_at  = NOW()
    WHERE user_id = p_user_id;
  END IF;

  BEGIN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, p_currency, v_new_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = EXCLUDED.updated_at;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, DECIMAL, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.debit_wallet(UUID, DECIMAL, TEXT) IS
  'Debits user fiat wallet. NGN: syncs user_wallets + wallets + wallet_balances. USD: syncs wallets + wallet_balances (user_wallets has no usd_balance column).';

COMMENT ON FUNCTION public.credit_wallet(UUID, DECIMAL, TEXT) IS
  'Credits user fiat wallet. NGN: syncs user_wallets + wallets + wallet_balances. USD: syncs wallets + wallet_balances (user_wallets has no usd_balance column).';
