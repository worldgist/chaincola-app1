-- Create account_deletions table
-- This table tracks account deletion requests with a 30-day grace period

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Deletion details
  reason TEXT, -- Optional reason for deletion
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  
  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  scheduled_deletion_at TIMESTAMPTZ NOT NULL, -- requested_at + 30 days
  processed_at TIMESTAMPTZ, -- When deletion was actually processed
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure scheduled_deletion_at is in the future
  CONSTRAINT valid_scheduled_date CHECK (scheduled_deletion_at > requested_at)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_account_deletions_user_id 
  ON public.account_deletions(user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletions_status 
  ON public.account_deletions(status);

CREATE INDEX IF NOT EXISTS idx_account_deletions_scheduled_deletion_at 
  ON public.account_deletions(scheduled_deletion_at);

-- Index for finding pending deletions that are due for processing
CREATE INDEX IF NOT EXISTS idx_account_deletions_pending_due 
  ON public.account_deletions(status, scheduled_deletion_at) 
  WHERE status = 'pending';

-- Enable Row Level Security (RLS)
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_deletions

-- Users can view their own deletion requests
CREATE POLICY "Users can view own deletion requests"
  ON public.account_deletions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own deletion requests
CREATE POLICY "Users can insert own deletion requests"
  ON public.account_deletions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own deletion requests (to cancel)
CREATE POLICY "Users can update own deletion requests"
  ON public.account_deletions
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all deletion requests
CREATE POLICY "Admins can view all deletion requests"
  ON public.account_deletions
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Admins can update all deletion requests
CREATE POLICY "Admins can update all deletion requests"
  ON public.account_deletions
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- Service role can do everything (for backend operations and scheduled deletions)
CREATE POLICY "Service role can do everything"
  ON public.account_deletions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_account_deletions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If status changed to 'processing' or 'completed', set processed_at
  IF NEW.status IN ('processing', 'completed') AND 
     (OLD.status IS NULL OR OLD.status NOT IN ('processing', 'completed')) THEN
    NEW.processed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_account_deletions_updated_at
  BEFORE UPDATE ON public.account_deletions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_deletions_updated_at();

-- Function to create an account deletion request
CREATE OR REPLACE FUNCTION public.create_account_deletion_request(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_grace_period_days INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  v_deletion_id UUID;
  v_scheduled_date TIMESTAMPTZ;
BEGIN
  -- Check if user already has a pending deletion request
  IF EXISTS (
    SELECT 1 FROM public.account_deletions 
    WHERE user_id = p_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'User already has a pending deletion request';
  END IF;
  
  -- Calculate scheduled deletion date
  v_scheduled_date := NOW() + (p_grace_period_days || ' days')::INTERVAL;
  
  -- Insert deletion request
  INSERT INTO public.account_deletions (
    user_id,
    reason,
    status,
    requested_at,
    scheduled_deletion_at
  ) VALUES (
    p_user_id,
    p_reason,
    'pending',
    NOW(),
    v_scheduled_date
  )
  RETURNING id INTO v_deletion_id;
  
  RETURN v_deletion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel an account deletion request
CREATE OR REPLACE FUNCTION public.cancel_account_deletion_request(
  p_deletion_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify the deletion request belongs to the user and is pending
  UPDATE public.account_deletions
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_deletion_id 
    AND user_id = p_user_id 
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found, already processed, or access denied';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's deletion request
CREATE OR REPLACE FUNCTION public.get_user_deletion_request(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  reason TEXT,
  status TEXT,
  requested_at TIMESTAMPTZ,
  scheduled_deletion_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.id,
    ad.user_id,
    ad.reason,
    ad.status,
    ad.requested_at,
    ad.scheduled_deletion_at,
    ad.processed_at,
    ad.created_at,
    ad.updated_at
  FROM public.account_deletions ad
  WHERE ad.user_id = p_user_id
    AND ad.status IN ('pending', 'processing')
  ORDER BY ad.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending deletions that are due for processing
-- This is used by a scheduled job/cron to process deletions
CREATE OR REPLACE FUNCTION public.get_due_deletion_requests()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  reason TEXT,
  requested_at TIMESTAMPTZ,
  scheduled_deletion_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.id,
    ad.user_id,
    ad.reason,
    ad.requested_at,
    ad.scheduled_deletion_at
  FROM public.account_deletions ad
  WHERE ad.status = 'pending'
    AND ad.scheduled_deletion_at <= NOW()
  ORDER BY ad.scheduled_deletion_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark deletion as processing (called by scheduled job)
CREATE OR REPLACE FUNCTION public.mark_deletion_processing(p_deletion_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.account_deletions
  SET status = 'processing',
      processed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_deletion_id
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found or not pending';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark deletion as completed (called after actual deletion)
CREATE OR REPLACE FUNCTION public.mark_deletion_completed(p_deletion_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.account_deletions
  SET status = 'completed',
      processed_at = COALESCE(processed_at, NOW()),
      updated_at = NOW()
  WHERE id = p_deletion_id
    AND status = 'processing';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found or not processing';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark deletion as failed (if deletion process fails)
CREATE OR REPLACE FUNCTION public.mark_deletion_failed(p_deletion_id UUID, p_error_message TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.account_deletions
  SET status = 'failed',
      updated_at = NOW()
  WHERE id = p_deletion_id
    AND status IN ('pending', 'processing');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found or already completed';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_account_deletion_request(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_deletion_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_deletion_requests() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_deletion_processing(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_deletion_completed(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_deletion_failed(UUID, TEXT) TO service_role;

-- Add comments
COMMENT ON TABLE public.account_deletions IS 'Tracks account deletion requests with a 30-day grace period';
COMMENT ON COLUMN public.account_deletions.user_id IS 'References auth.users.id';
COMMENT ON COLUMN public.account_deletions.status IS 'Deletion status: pending, processing, completed, cancelled, or failed';
COMMENT ON COLUMN public.account_deletions.scheduled_deletion_at IS 'Date and time when account will be deleted (requested_at + 30 days)';
COMMENT ON COLUMN public.account_deletions.processed_at IS 'Timestamp when deletion was actually processed';
COMMENT ON FUNCTION public.create_account_deletion_request IS 'Create a new account deletion request with 30-day grace period';
COMMENT ON FUNCTION public.cancel_account_deletion_request IS 'Cancel a pending account deletion request';
COMMENT ON FUNCTION public.get_user_deletion_request IS 'Get the current deletion request for a user';
COMMENT ON FUNCTION public.get_due_deletion_requests IS 'Get pending deletion requests that are due for processing (for scheduled jobs)';
COMMENT ON FUNCTION public.mark_deletion_processing IS 'Mark a deletion request as processing (called by scheduled job)';
COMMENT ON FUNCTION public.mark_deletion_completed IS 'Mark a deletion request as completed (after actual deletion)';
COMMENT ON FUNCTION public.mark_deletion_failed IS 'Mark a deletion request as failed (if deletion process fails)';
















