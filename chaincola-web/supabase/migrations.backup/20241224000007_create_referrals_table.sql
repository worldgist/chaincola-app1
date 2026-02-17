-- Create referrals table
-- This table tracks referral relationships and rewards

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Referral relationship
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL, -- The referral code that was used
  
  -- Reward information
  reward_amount DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  reward_currency TEXT DEFAULT 'NGN' NOT NULL, -- NGN, USD, etc.
  reward_status TEXT DEFAULT 'pending' NOT NULL CHECK (reward_status IN ('pending', 'paid', 'cancelled')),
  
  -- Payment tracking
  paid_at TIMESTAMPTZ,
  payment_transaction_id TEXT, -- Reference to transaction if reward was paid
  
  -- Metadata
  notes TEXT, -- Additional notes about the referral
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure a user can only be referred once
  CONSTRAINT unique_referred_user UNIQUE (referred_user_id),
  
  -- Ensure referrer and referred are different users
  CONSTRAINT different_users CHECK (referrer_user_id != referred_user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_user_id 
  ON public.referrals(referrer_user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id 
  ON public.referrals(referred_user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referral_code 
  ON public.referrals(referral_code);

CREATE INDEX IF NOT EXISTS idx_referrals_reward_status 
  ON public.referrals(reward_status);

CREATE INDEX IF NOT EXISTS idx_referrals_created_at 
  ON public.referrals(created_at DESC);

-- Composite index for common query: get referrals by referrer and status
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status 
  ON public.referrals(referrer_user_id, reward_status, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referrals

-- Users can view referrals where they are the referrer
CREATE POLICY "Users can view own referrals"
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referrer_user_id);

-- Users can view referrals where they were referred (to see who referred them)
CREATE POLICY "Users can view referrals where they were referred"
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referred_user_id);

-- Service role can insert referrals (for backend operations)
CREATE POLICY "Service role can insert referrals"
  ON public.referrals
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Admins can view all referrals
CREATE POLICY "Admins can view all referrals"
  ON public.referrals
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can update referrals (to update reward status, etc.)
CREATE POLICY "Admins can update referrals"
  ON public.referrals
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role can do everything"
  ON public.referrals
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If reward_status changed to 'paid', set paid_at timestamp
  IF NEW.reward_status = 'paid' AND (OLD.reward_status IS NULL OR OLD.reward_status != 'paid') THEN
    NEW.paid_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_referrals_updated_at();

-- Function to create a referral relationship
CREATE OR REPLACE FUNCTION public.create_referral(
  p_referrer_user_id UUID,
  p_referred_user_id UUID,
  p_referral_code TEXT,
  p_reward_amount DECIMAL DEFAULT 0,
  p_reward_currency TEXT DEFAULT 'NGN'
)
RETURNS UUID AS $$
DECLARE
  v_referral_id UUID;
BEGIN
  -- Check that referrer and referred are different
  IF p_referrer_user_id = p_referred_user_id THEN
    RAISE EXCEPTION 'User cannot refer themselves';
  END IF;
  
  -- Check if referred user already has a referral
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = p_referred_user_id) THEN
    RAISE EXCEPTION 'User has already been referred';
  END IF;
  
  -- Insert referral
  INSERT INTO public.referrals (
    referrer_user_id,
    referred_user_id,
    referral_code,
    reward_amount,
    reward_currency,
    reward_status
  ) VALUES (
    p_referrer_user_id,
    p_referred_user_id,
    p_referral_code,
    p_reward_amount,
    p_reward_currency,
    'pending'
  )
  RETURNING id INTO v_referral_id;
  
  -- Update user_profiles.referred_by field
  UPDATE public.user_profiles
  SET referred_by = p_referral_code,
      updated_at = NOW()
  WHERE user_id = p_referred_user_id;
  
  RETURN v_referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get referral statistics for a user
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id UUID)
RETURNS TABLE (
  total_referrals BIGINT,
  pending_referrals BIGINT,
  paid_referrals BIGINT,
  total_earnings DECIMAL,
  pending_earnings DECIMAL,
  paid_earnings DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_referrals,
    COUNT(*) FILTER (WHERE reward_status = 'pending')::BIGINT as pending_referrals,
    COUNT(*) FILTER (WHERE reward_status = 'paid')::BIGINT as paid_referrals,
    COALESCE(SUM(reward_amount), 0) as total_earnings,
    COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'pending'), 0) as pending_earnings,
    COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'paid'), 0) as paid_earnings
  FROM public.referrals
  WHERE referrer_user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent referrals for a user
CREATE OR REPLACE FUNCTION public.get_recent_referrals(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  referred_user_id UUID,
  referral_code TEXT,
  reward_amount DECIMAL,
  reward_currency TEXT,
  reward_status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.referred_user_id,
    r.referral_code,
    r.reward_amount,
    r.reward_currency,
    r.reward_status,
    r.created_at
  FROM public.referrals r
  WHERE r.referrer_user_id = p_user_id
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate a referral code
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  user_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if code is empty
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Referral code cannot be empty'::TEXT;
    RETURN;
  END IF;
  
  -- Look up user by referral code
  SELECT up.user_id INTO v_user_id
  FROM public.user_profiles up
  WHERE up.referral_code = UPPER(TRIM(p_code))
  LIMIT 1;
  
  -- If user found, code is valid
  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT false, NULL::UUID, 'Invalid referral code'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark referral reward as paid
CREATE OR REPLACE FUNCTION public.mark_referral_reward_paid(
  p_referral_id UUID,
  p_admin_user_id UUID,
  p_payment_transaction_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can mark referral rewards as paid';
  END IF;
  
  -- Update referral
  UPDATE public.referrals
  SET reward_status = 'paid',
      paid_at = NOW(),
      payment_transaction_id = p_payment_transaction_id,
      updated_at = NOW()
  WHERE id = p_referral_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_referral(UUID, UUID, TEXT, DECIMAL, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_referrals(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_referral_reward_paid(UUID, UUID, TEXT) TO authenticated;

-- Add comments
COMMENT ON TABLE public.referrals IS 'Tracks referral relationships and rewards between users';
COMMENT ON COLUMN public.referrals.referrer_user_id IS 'User who made the referral';
COMMENT ON COLUMN public.referrals.referred_user_id IS 'User who was referred (can only be referred once)';
COMMENT ON COLUMN public.referrals.referral_code IS 'The referral code that was used';
COMMENT ON COLUMN public.referrals.reward_amount IS 'Reward amount for the referrer';
COMMENT ON COLUMN public.referrals.reward_status IS 'Reward status: pending, paid, or cancelled';
COMMENT ON COLUMN public.referrals.paid_at IS 'Timestamp when the reward was paid';
COMMENT ON FUNCTION public.create_referral IS 'Create a new referral relationship';
COMMENT ON FUNCTION public.get_referral_stats IS 'Get referral statistics for a user';
COMMENT ON FUNCTION public.get_recent_referrals IS 'Get recent referrals for a user';
COMMENT ON FUNCTION public.validate_referral_code IS 'Validate if a referral code exists and return the user_id';
COMMENT ON FUNCTION public.mark_referral_reward_paid IS 'Mark a referral reward as paid (admin only)';

