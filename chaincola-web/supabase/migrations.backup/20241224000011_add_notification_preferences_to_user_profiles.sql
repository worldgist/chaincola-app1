-- Add notification preferences columns to user_profiles table
-- These columns store user preferences for push and email notifications

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true NOT NULL;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_push_notifications 
  ON public.user_profiles(push_notifications);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email_notifications 
  ON public.user_profiles(email_notifications);

-- Add comments
COMMENT ON COLUMN public.user_profiles.push_notifications IS 'Whether the user has push notifications enabled';
COMMENT ON COLUMN public.user_profiles.email_notifications IS 'Whether the user has email notifications enabled';
















