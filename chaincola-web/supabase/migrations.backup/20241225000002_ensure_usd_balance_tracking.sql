-- Ensure USD Balance Tracking
-- This migration ensures USD balances are properly tracked and synced across tables

-- 1. Ensure wallet_balances supports USD properly
-- Add USD to wallet_balances if not already there for existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- For each user with a USD balance in wallets table, ensure they have a USD entry in wallet_balances
  FOR user_record IN 
    SELECT DISTINCT user_id, usd_balance 
    FROM public.wallets 
    WHERE usd_balance > 0
  LOOP
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (user_record.user_id, 'USD', user_record.usd_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET 
      balance = GREATEST(wallet_balances.balance, user_record.usd_balance),
      updated_at = NOW();
  END LOOP;
END $$;

-- 2. Create function to sync USD balance between wallets and wallet_balances
CREATE OR REPLACE FUNCTION public.sync_usd_balance(
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_wallets_usd DECIMAL(20, 2);
  v_wallet_balances_usd DECIMAL(20, 8);
BEGIN
  -- Get USD from wallets table
  SELECT COALESCE(usd_balance, 0) INTO v_wallets_usd
  FROM public.wallets
  WHERE user_id = p_user_id;
  
  -- Get USD from wallet_balances table
  SELECT COALESCE(balance, 0) INTO v_wallet_balances_usd
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = 'USD';
  
  -- Use the higher value (most recent/accurate)
  IF v_wallet_balances_usd > v_wallets_usd THEN
    -- Update wallets table
    UPDATE public.wallets
    SET usd_balance = v_wallet_balances_usd,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF v_wallets_usd > v_wallet_balances_usd THEN
    -- Update wallet_balances table
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (p_user_id, 'USD', v_wallets_usd, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET 
      balance = v_wallets_usd,
      updated_at = NOW();
  END IF;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create function to credit USD balance (ensures both tables are updated)
CREATE OR REPLACE FUNCTION public.credit_usd_balance(
  p_user_id UUID,
  p_amount DECIMAL(20, 2)
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Update wallets table
  INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
  VALUES (p_user_id, 0, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET
    usd_balance = wallets.usd_balance + p_amount,
    updated_at = NOW();

  -- Update wallet_balances table
  INSERT INTO public.wallet_balances (user_id, currency, balance)
  VALUES (p_user_id, 'USD', p_amount)
  ON CONFLICT (user_id, currency) DO UPDATE
  SET
    balance = wallet_balances.balance + p_amount,
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to credit USD balance: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to debit USD balance (ensures both tables are updated)
CREATE OR REPLACE FUNCTION public.debit_usd_balance(
  p_user_id UUID,
  p_amount DECIMAL(20, 2)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_balance DECIMAL(20, 2);
BEGIN
  -- Get current balance from wallets table
  SELECT COALESCE(usd_balance, 0) INTO v_current_balance
  FROM public.wallets
  WHERE user_id = p_user_id;

  -- Check if wallet exists, create if not
  IF v_current_balance IS NULL THEN
    INSERT INTO public.wallets (user_id, ngn_balance, usd_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT COALESCE(usd_balance, 0) INTO v_current_balance
    FROM public.wallets
    WHERE user_id = p_user_id;
  END IF;

  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient USD balance. Current: %, Requested: %',
      v_current_balance, p_amount;
  END IF;

  -- Update wallets table
  UPDATE public.wallets
  SET
    usd_balance = usd_balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Update wallet_balances table
  UPDATE public.wallet_balances
  SET
    balance = balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id AND currency = 'USD';

  RETURN TRUE;
EXCEPTION
  WHEN undefined_table THEN
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to debit USD balance: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger to sync USD balance when wallet_balances is updated
CREATE OR REPLACE FUNCTION public.sync_usd_on_wallet_balances_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If USD balance in wallet_balances is updated, sync to wallets table
  IF NEW.currency = 'USD' THEN
    UPDATE public.wallets
    SET 
      usd_balance = NEW.balance,
      updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_usd_on_wallet_balances_update ON public.wallet_balances;
CREATE TRIGGER trigger_sync_usd_on_wallet_balances_update
  AFTER INSERT OR UPDATE ON public.wallet_balances
  FOR EACH ROW
  WHEN (NEW.currency = 'USD')
  EXECUTE FUNCTION public.sync_usd_on_wallet_balances_update();

-- 6. Create trigger to sync USD balance when wallets table is updated
CREATE OR REPLACE FUNCTION public.sync_usd_on_wallets_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If USD balance in wallets is updated, sync to wallet_balances table
  IF NEW.usd_balance IS DISTINCT FROM OLD.usd_balance THEN
    INSERT INTO public.wallet_balances (user_id, currency, balance, updated_at)
    VALUES (NEW.user_id, 'USD', NEW.usd_balance, NOW())
    ON CONFLICT (user_id, currency) DO UPDATE
    SET 
      balance = NEW.usd_balance,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_usd_on_wallets_update ON public.wallets;
CREATE TRIGGER trigger_sync_usd_on_wallets_update
  AFTER INSERT OR UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_usd_on_wallets_update();

-- 7. Add comments
COMMENT ON FUNCTION public.sync_usd_balance IS 'Syncs USD balance between wallets and wallet_balances tables';
COMMENT ON FUNCTION public.credit_usd_balance IS 'Credits USD balance to both wallets and wallet_balances tables';
COMMENT ON FUNCTION public.debit_usd_balance IS 'Debits USD balance from both wallets and wallet_balances tables, with balance validation';

-- 8. Sync all existing USD balances
SELECT public.sync_usd_balance(user_id)
FROM (
  SELECT DISTINCT user_id 
  FROM public.wallets 
  WHERE usd_balance > 0
  UNION
  SELECT DISTINCT user_id 
  FROM public.wallet_balances 
  WHERE currency = 'USD' AND balance > 0
) AS users_with_usd;





