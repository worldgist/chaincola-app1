-- Fix RLS policies for wallet_balances to allow service_role to INSERT/UPDATE
-- The credit_crypto_wallet function needs to be able to INSERT new balances
-- SECURITY DEFINER functions should bypass RLS, but let's ensure policies allow service_role

-- Drop existing policies if they exist (we'll recreate them)
DROP POLICY IF EXISTS "Users can view own balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Admins can view all balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Users can update own balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Admins can update all balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Users can insert own balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Admins can insert balances" ON public.wallet_balances;
DROP POLICY IF EXISTS "Service role can manage all balances" ON public.wallet_balances;

-- Allow service_role to do everything (for Edge Functions)
CREATE POLICY "Service role can manage all balances"
  ON public.wallet_balances
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

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

-- Users can insert their own balances (for initial wallet creation)
CREATE POLICY "Users can insert own balances"
  ON public.wallet_balances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert balances
CREATE POLICY "Admins can insert balances"
  ON public.wallet_balances
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

