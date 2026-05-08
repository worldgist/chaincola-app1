-- Create account_verifications table
-- This table stores user account verification documents and status
-- Used for KYC (Know Your Customer) verification process

CREATE TABLE IF NOT EXISTS public.account_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Personal Information
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  address TEXT NOT NULL,
  
  -- National Identification Number (NIN)
  nin TEXT NOT NULL, -- 11-digit NIN
  
  -- Document URLs (stored in Supabase Storage)
  nin_front_url TEXT,
  nin_back_url TEXT,
  passport_photo_url TEXT,
  
  -- Verification Status
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin who reviewed
  
  -- Rejection details
  rejection_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_account_verifications_user_id 
  ON public.account_verifications(user_id);

CREATE INDEX IF NOT EXISTS idx_account_verifications_status 
  ON public.account_verifications(status);

CREATE INDEX IF NOT EXISTS idx_account_verifications_submitted_at 
  ON public.account_verifications(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_verifications_reviewed_by 
  ON public.account_verifications(reviewed_by);

-- Ensure only one pending verification per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_verifications_user_pending 
  ON public.account_verifications(user_id) 
  WHERE status = 'pending';

-- Enable Row Level Security (RLS)
ALTER TABLE public.account_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_verifications

-- Users can view their own verification records
CREATE POLICY "Users can view own verifications"
  ON public.account_verifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own verification records
CREATE POLICY "Users can insert own verifications"
  ON public.account_verifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own verification records (only if status is pending or rejected)
CREATE POLICY "Users can update own pending verifications"
  ON public.account_verifications
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('pending', 'rejected'))
  WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'rejected'));

-- Admins can view all verification records
CREATE POLICY "Admins can view all verifications"
  ON public.account_verifications
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can update all verification records (for approval/rejection)
CREATE POLICY "Admins can update all verifications"
  ON public.account_verifications
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role can do everything"
  ON public.account_verifications
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_account_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_account_verifications_updated_at
  BEFORE UPDATE ON public.account_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_verifications_updated_at();

-- Function to update reviewed_at when status changes to approved or rejected
CREATE OR REPLACE FUNCTION public.update_account_verification_reviewed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changed to approved or rejected, set reviewed_at
  IF NEW.status IN ('approved', 'rejected') AND 
     (OLD.status IS NULL OR OLD.status = 'pending') THEN
    NEW.reviewed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reviewed_at when verification is approved/rejected
CREATE TRIGGER update_account_verification_reviewed_at
  BEFORE UPDATE ON public.account_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_verification_reviewed_at();

-- Function to get user verification status
CREATE OR REPLACE FUNCTION public.get_user_verification_status(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.account_verifications
  WHERE user_id = p_user_id
  ORDER BY submitted_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_status, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admin to approve verification
CREATE OR REPLACE FUNCTION public.admin_approve_verification(
  p_verification_id UUID,
  p_admin_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can approve verifications';
  END IF;
  
  -- Update verification status
  UPDATE public.account_verifications
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_verification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record not found';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admin to reject verification
CREATE OR REPLACE FUNCTION public.admin_reject_verification(
  p_verification_id UUID,
  p_admin_user_id UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can reject verifications';
  END IF;
  
  -- Update verification status
  UPDATE public.account_verifications
  SET status = 'rejected',
      reviewed_at = NOW(),
      reviewed_by = p_admin_user_id,
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
  WHERE id = p_verification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record not found';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_verification_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_verification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_verification(UUID, UUID, TEXT) TO authenticated;

-- Add comments
COMMENT ON TABLE public.account_verifications IS 'Stores user account verification documents and status for KYC compliance';
COMMENT ON COLUMN public.account_verifications.user_id IS 'References auth.users.id';
COMMENT ON COLUMN public.account_verifications.nin IS '11-digit National Identification Number';
COMMENT ON COLUMN public.account_verifications.status IS 'Verification status: pending, approved, or rejected';
COMMENT ON COLUMN public.account_verifications.reviewed_by IS 'Admin user who reviewed the verification';
COMMENT ON COLUMN public.account_verifications.rejection_reason IS 'Reason for rejection if status is rejected';
COMMENT ON FUNCTION public.get_user_verification_status IS 'Get the current verification status for a user';
COMMENT ON FUNCTION public.admin_approve_verification IS 'Admin function to approve a verification request';
COMMENT ON FUNCTION public.admin_reject_verification IS 'Admin function to reject a verification request with reason';

