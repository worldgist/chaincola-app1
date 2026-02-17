-- Create notifications table
-- This table stores user notifications for various events and activities

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification content
  type TEXT NOT NULL CHECK (type IN (
    'transaction',
    'payment',
    'withdrawal',
    'deposit',
    'system',
    'promotion',
    'security',
    'referral',
    'gift-card'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Notification status
  status TEXT DEFAULT 'unread' NOT NULL CHECK (status IN ('read', 'unread')),
  
  -- Additional data (JSONB for flexible metadata)
  data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  read_at TIMESTAMPTZ -- When the notification was marked as read
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_status 
  ON public.notifications(status);

CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON public.notifications(type);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON public.notifications(created_at DESC);

-- Composite index for common query: get unread notifications for a user
CREATE INDEX IF NOT EXISTS idx_notifications_user_status 
  ON public.notifications(user_id, status, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own notifications (for system-generated notifications)
-- Note: In practice, notifications are usually created by backend/triggers
CREATE POLICY "Users can insert own notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notifications (to mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications"
  ON public.notifications
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role can do everything"
  ON public.notifications
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- If status changed to 'read', set read_at timestamp
  IF NEW.status = 'read' AND (OLD.status IS NULL OR OLD.status = 'unread') THEN
    NEW.read_at = NOW();
  END IF;
  
  -- If status changed back to 'unread', clear read_at
  IF NEW.status = 'unread' AND OLD.status = 'read' THEN
    NEW.read_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notifications_updated_at();

-- Function to get unread notifications count for a user
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.notifications
  WHERE user_id = p_user_id AND status = 'unread';
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify the notification belongs to the user
  UPDATE public.notifications
  SET status = 'read',
      read_at = NOW(),
      updated_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or access denied';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.notifications
  SET status = 'read',
      read_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'unread';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a notification (for use by backend/triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data,
    status
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_data,
    'unread'
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- Add comments
COMMENT ON TABLE public.notifications IS 'Stores user notifications for various events and activities';
COMMENT ON COLUMN public.notifications.user_id IS 'References auth.users.id';
COMMENT ON COLUMN public.notifications.type IS 'Type of notification: transaction, payment, withdrawal, deposit, system, promotion, security, referral, gift-card';
COMMENT ON COLUMN public.notifications.status IS 'Notification status: read or unread';
COMMENT ON COLUMN public.notifications.data IS 'Additional metadata in JSON format (e.g., transaction_id, amount, etc.)';
COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when the notification was marked as read';
COMMENT ON FUNCTION public.get_unread_notifications_count IS 'Get the count of unread notifications for a user';
COMMENT ON FUNCTION public.mark_notification_as_read IS 'Mark a specific notification as read';
COMMENT ON FUNCTION public.mark_all_notifications_as_read IS 'Mark all unread notifications as read for a user';
COMMENT ON FUNCTION public.create_notification IS 'Create a new notification (for use by backend/triggers)';
















