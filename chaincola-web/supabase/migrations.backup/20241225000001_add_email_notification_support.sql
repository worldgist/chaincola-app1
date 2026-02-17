-- Add email notification support for transaction notifications
-- This migration adds functionality to send emails when transaction notifications are created

-- Function to send email notification via edge function
-- Note: This uses pg_net extension if available, otherwise emails will be sent via edge functions
CREATE OR REPLACE FUNCTION public.send_transaction_email_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_notification_data JSONB
)
RETURNS void AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_email_html TEXT;
  v_email_subject TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get user email and name
  SELECT email, COALESCE(full_name, 'User') INTO v_user_email, v_user_name
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  -- If no email found, skip
  IF v_user_email IS NULL THEN
    RETURN;
  END IF;

  -- Check if email notifications are enabled
  DECLARE
    v_email_enabled BOOLEAN;
  BEGIN
    SELECT COALESCE(email_notifications_enabled, true) INTO v_email_enabled
    FROM public.user_notification_preferences
    WHERE user_id = p_user_id;

    -- Also check user_profiles
    IF v_email_enabled IS NULL THEN
      SELECT COALESCE(email_notifications, true) INTO v_email_enabled
      FROM public.user_profiles
      WHERE user_id = p_user_id;
    END IF;

    IF v_email_enabled = false THEN
      RETURN;
    END IF;
  END;

  -- Get Supabase URL and service key from environment (will be set in edge function context)
  -- For database functions, we'll need to call the edge function via HTTP
  -- This is a placeholder - actual email sending will be handled by edge functions
  
  -- The email sending will be handled by the edge functions that create notifications
  -- This function is here for future use if we want to add pg_net support
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.send_transaction_email_notification(UUID, TEXT, JSONB) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.send_transaction_email_notification IS 'Placeholder function for sending transaction email notifications. Actual email sending is handled by edge functions.';












