-- Create tables for admin user management
-- This includes user account status, wallet balances, and admin action logs

-- 1. Add account_status column to user_profiles if it doesn't exist
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' NOT NULL;

-- Add index on account_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status 
ON public.user_profiles(account_status);

-- Add comment
COMMENT ON COLUMN public.user_profiles.account_status IS 'User account status: active, suspended, pending, deleted';

-- 2. Create wallet_balances table for user balances
CREATE TABLE IF NOT EXISTS public.wallet_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL, -- BTC, ETH, USDT, USDC, NGN, USD
  balance DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  locked_balance DECIMAL(20, 8) DEFAULT 0 NOT NULL, -- For pending transactions
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, currency)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallet_balances_user_id ON public.wallet_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_currency ON public.wallet_balances(currency);

-- Enable RLS
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallet_balances
-- Users can view their own balances
CREATE POLICY "Users can view own balances"
  ON public.wallet_balances
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all balances
CREATE POLICY "Admins can view all balances"
  ON public.wallet_balances
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Users can update their own balances (for app operations)
CREATE POLICY "Users can update own balances"
  ON public.wallet_balances
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all balances
CREATE POLICY "Admins can update all balances"
  ON public.wallet_balances
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Users can insert their own balances
CREATE POLICY "Users can insert own balances"
  ON public.wallet_balances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert balances
CREATE POLICY "Admins can insert balances"
  ON public.wallet_balances
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- 3. Create admin_action_logs table to track admin actions
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- suspend, activate, delete, credit, debit, etc.
  action_details JSONB, -- Store additional details like amount, currency, reason
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_user_id ON public.admin_action_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target_user_id ON public.admin_action_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type ON public.admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON public.admin_action_logs(created_at);

-- Enable RLS
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_action_logs
-- Only admins can view action logs
CREATE POLICY "Admins can view action logs"
  ON public.admin_action_logs
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Only admins can insert action logs
CREATE POLICY "Admins can insert action logs"
  ON public.admin_action_logs
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Function to automatically update updated_at timestamp for wallet_balances
CREATE OR REPLACE FUNCTION public.update_wallet_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on wallet_balances update
CREATE TRIGGER update_wallet_balances_updated_at
  BEFORE UPDATE ON public.wallet_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_balances_updated_at();

-- Function to get or create wallet balance
CREATE OR REPLACE FUNCTION public.get_or_create_wallet_balance(
  p_user_id UUID,
  p_currency TEXT
)
RETURNS public.wallet_balances AS $$
DECLARE
  v_balance public.wallet_balances;
BEGIN
  -- Try to get existing balance
  SELECT * INTO v_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id AND currency = p_currency;
  
  -- If not found, create it
  IF NOT FOUND THEN
    INSERT INTO public.wallet_balances (user_id, currency, balance)
    VALUES (p_user_id, p_currency, 0)
    RETURNING * INTO v_balance;
  END IF;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to credit user balance (admin only)
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
  
  -- Get or create balance
  SELECT * INTO v_balance FROM public.get_or_create_wallet_balance(p_user_id, p_currency);
  
  -- Update balance
  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;
  
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

-- Function to debit user balance (admin only)
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
  
  -- Get or create balance
  SELECT * INTO v_balance FROM public.get_or_create_wallet_balance(p_user_id, p_currency);
  v_current_balance := v_balance.balance;
  
  -- Check if sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current_balance, p_amount;
  END IF;
  
  -- Update balance
  UPDATE public.wallet_balances
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND currency = p_currency;
  
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
      'reason', p_reason
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to suspend user (admin only)
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id UUID,
  p_admin_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can suspend users';
  END IF;
  
  -- Update user status
  UPDATE public.user_profiles
  SET account_status = 'suspended',
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the action
  INSERT INTO public.admin_action_logs (
    admin_user_id,
    target_user_id,
    action_type
  ) VALUES (
    p_admin_user_id,
    p_user_id,
    'suspend'
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to activate user (admin only)
CREATE OR REPLACE FUNCTION public.admin_activate_user(
  p_user_id UUID,
  p_admin_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can activate users';
  END IF;
  
  -- Update user status
  UPDATE public.user_profiles
  SET account_status = 'active',
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the action
  INSERT INTO public.admin_action_logs (
    admin_user_id,
    target_user_id,
    action_type
  ) VALUES (
    p_admin_user_id,
    p_user_id,
    'activate'
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_wallet_balance(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_balance(UUID, TEXT, DECIMAL, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_debit_balance(UUID, TEXT, DECIMAL, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_user(UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON TABLE public.wallet_balances IS 'Stores user wallet balances for different currencies';
COMMENT ON TABLE public.admin_action_logs IS 'Logs all admin actions for audit purposes';
COMMENT ON FUNCTION public.admin_credit_balance IS 'Admin function to credit user balance';
COMMENT ON FUNCTION public.admin_debit_balance IS 'Admin function to debit user balance';
COMMENT ON FUNCTION public.admin_suspend_user IS 'Admin function to suspend a user';
COMMENT ON FUNCTION public.admin_activate_user IS 'Admin function to activate a user';



















