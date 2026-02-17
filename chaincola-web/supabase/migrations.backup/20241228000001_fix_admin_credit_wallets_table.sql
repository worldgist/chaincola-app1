-- Fix admin_credit_balance to update both wallets and wallet_balances tables
-- This ensures users can see their credited balance immediately

CREATE OR REPLACE FUNCTION public.admin_credit_balance(
  p_user_id UUID,
  p_currency TEXT,
  p_amount DECIMAL,
  p_reason TEXT,
  p_admin_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance public.wallet_balances;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can credit balances';
  END IF;
  
  -- Get or create balance in wallet_balances table
  SELECT * INTO v_balance FROM public.get_or_create_wallet_balance(p_user_id, p_currency);
  
  -- Update wallet_balances table
  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;
  
  -- Also update wallets table for NGN and USD currencies
  -- This ensures the balance is visible when getNgnBalance/getUsdBalance checks wallets table first
  IF p_currency IN ('NGN', 'USD') THEN
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
    VALUES (
      p_user_id,
      CASE WHEN p_currency = 'NGN' THEN p_amount ELSE 0 END,
      CASE WHEN p_currency = 'USD' THEN p_amount ELSE 0 END
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      ngn_balance = CASE 
        WHEN p_currency = 'NGN' THEN wallets.ngn_balance + p_amount
        ELSE wallets.ngn_balance
      END,
      usd_balance = CASE 
        WHEN p_currency = 'USD' THEN wallets.usd_balance + p_amount
        ELSE wallets.usd_balance
      END,
      updated_at = NOW();
  END IF;
  
  -- Log the action
  INSERT INTO public.admin_action_logs (
    admin_user_id,
    target_user_id,
    action_type,
    action_details
  ) VALUES (
    p_admin_user_id,
    p_user_id,
    'credit',
    jsonb_build_object(
      'currency', p_currency,
      'amount', p_amount,
      'reason', p_reason
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix admin_debit_balance to update both tables
CREATE OR REPLACE FUNCTION public.admin_debit_balance(
  p_user_id UUID,
  p_currency TEXT,
  p_amount DECIMAL,
  p_reason TEXT,
  p_admin_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance public.wallet_balances;
  v_current_balance DECIMAL;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can debit balances';
  END IF;
  
  -- Get current balance
  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_currency;
  
  -- Check if balance exists
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Balance not found for user % and currency %', p_user_id, p_currency;
  END IF;
  
  -- Check if sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Required: %', v_current_balance, p_amount;
  END IF;
  
  -- Update wallet_balances table
  UPDATE public.wallet_balances
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;
  
  -- Also update wallets table for NGN and USD currencies
  IF p_currency IN ('NGN', 'USD') THEN
    UPDATE public.wallets
    SET
      ngn_balance = CASE 
        WHEN p_currency = 'NGN' THEN GREATEST(0, wallets.ngn_balance - p_amount)
        ELSE wallets.ngn_balance
      END,
      usd_balance = CASE 
        WHEN p_currency = 'USD' THEN GREATEST(0, wallets.usd_balance - p_amount)
        ELSE wallets.usd_balance
      END,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  -- Log the action
  INSERT INTO public.admin_action_logs (
    admin_user_id,
    target_user_id,
    action_type,
    action_details
  ) VALUES (
    p_admin_user_id,
    p_user_id,
    'debit',
    jsonb_build_object(
      'currency', p_currency,
      'amount', p_amount,
      'reason', p_reason,
      'balance_before', v_current_balance,
      'balance_after', v_current_balance - p_amount
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.admin_credit_balance IS 'Credits a user balance (admin only). Updates both wallets and wallet_balances tables to ensure balance is visible immediately.';
COMMENT ON FUNCTION public.admin_debit_balance IS 'Debits a user balance (admin only). Updates both wallets and wallet_balances tables to ensure balance is visible immediately.';













