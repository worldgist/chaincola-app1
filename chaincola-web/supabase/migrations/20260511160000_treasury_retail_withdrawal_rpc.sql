-- Let authenticated users log one treasury row per bank withdrawal (ties retail bank payout to treasury journal).

CREATE OR REPLACE FUNCTION public.log_treasury_movement_for_withdrawal(p_withdrawal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w RECORD;
  v_total numeric(20, 2);
  ref text;
  existing_id uuid;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id, user_id, amount, fee_amount, currency, status, bank_name, account_number, account_name
  INTO w
  FROM public.withdrawals
  WHERE id = p_withdrawal_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found';
  END IF;

  ref := 'withdrawal-' || w.id::text;

  SELECT id INTO existing_id FROM public.treasury_movements WHERE reference = ref LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  v_total := round(coalesce(w.amount, 0) + coalesce(w.fee_amount, 0), 2);

  INSERT INTO public.treasury_movements (
    vault_code,
    type,
    amount,
    reference,
    status,
    metadata,
    performed_by
  )
  VALUES (
    'SETTLEMENTS_AND_PAYOUTS',
    'SETTLEMENT',
    v_total,
    ref,
    'COMPLETED',
    jsonb_build_object(
      'source', 'bank_transfer_to_customer',
      'withdrawal_id', w.id,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_name', w.account_name,
      'withdrawal_status_at_log', w.status,
      'currency', coalesce(w.currency, 'NGN')
    ),
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.log_treasury_movement_for_withdrawal(uuid) IS
  'Idempotent treasury journal entry for NGN bank withdrawal (amount+fee); caller must own the withdrawal.';

GRANT EXECUTE ON FUNCTION public.log_treasury_movement_for_withdrawal(uuid) TO authenticated;
