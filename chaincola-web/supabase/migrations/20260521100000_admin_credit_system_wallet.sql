-- Atomic credit to public.system_wallets id=1 (hot crypto inventory or NGN float).
-- EXECUTE granted to service_role only; Edge Function must verify admin JWT before calling.

CREATE OR REPLACE FUNCTION public.admin_credit_system_wallet(
  p_asset TEXT,
  p_amount NUMERIC,
  p_admin_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS SETOF public.system_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset TEXT;
  v_max CONSTANT NUMERIC := 1000000000000;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  IF p_amount > v_max THEN
    RAISE EXCEPTION 'amount exceeds maximum allowed per operation';
  END IF;

  v_asset := upper(trim(p_asset));
  IF v_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN') THEN
    RAISE EXCEPTION 'unsupported asset: %', p_asset;
  END IF;

  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_user_id required';
  END IF;

  INSERT INTO public.system_wallets (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  IF v_asset = 'NGN' THEN
    UPDATE public.system_wallets
    SET ngn_float_balance = ngn_float_balance + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSIF v_asset = 'BTC' THEN
    UPDATE public.system_wallets
    SET btc_inventory = btc_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSIF v_asset = 'ETH' THEN
    UPDATE public.system_wallets
    SET eth_inventory = eth_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSIF v_asset = 'USDT' THEN
    UPDATE public.system_wallets
    SET usdt_inventory = usdt_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSIF v_asset = 'USDC' THEN
    UPDATE public.system_wallets
    SET usdc_inventory = usdc_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSIF v_asset = 'XRP' THEN
    UPDATE public.system_wallets
    SET xrp_inventory = xrp_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  ELSE
    UPDATE public.system_wallets
    SET sol_inventory = sol_inventory + p_amount,
        updated_at = NOW()
    WHERE id = 1;
  END IF;

  INSERT INTO public.admin_action_logs (
    admin_user_id,
    target_user_id,
    action_type,
    action_details
  )
  VALUES (
    p_admin_user_id,
    NULL,
    'system_wallet_fund',
    jsonb_strip_nulls(
      jsonb_build_object(
        'asset', v_asset,
        'amount', p_amount::text,
        'reason', p_reason
      )
    )
  );

  RETURN QUERY
  SELECT *
  FROM public.system_wallets
  WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.admin_credit_system_wallet(TEXT, NUMERIC, UUID, TEXT) IS
  'Credits system_wallets id=1: hot *_inventory for crypto, ngn_float_balance for NGN. service_role only; verify admin in Edge before RPC.';

REVOKE ALL ON FUNCTION public.admin_credit_system_wallet(TEXT, NUMERIC, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_credit_system_wallet(TEXT, NUMERIC, UUID, TEXT) TO service_role;
