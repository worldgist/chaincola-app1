-- Create push_notification_tokens table
-- Stores Expo push notification tokens for users

CREATE TABLE IF NOT EXISTS public.push_notification_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one token per user per platform
  UNIQUE(user_id, platform)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id 
  ON public.push_notification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_token 
  ON public.push_notification_tokens(token);

-- Enable Row Level Security (RLS)
ALTER TABLE public.push_notification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own tokens
CREATE POLICY "Users can view own push tokens"
  ON public.push_notification_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own push tokens"
  ON public.push_notification_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update own push tokens"
  ON public.push_notification_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own push tokens"
  ON public.push_notification_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_token_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_push_token_updated_at
  BEFORE UPDATE ON public.push_notification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_updated_at();

COMMENT ON TABLE public.push_notification_tokens IS 'Stores Expo push notification tokens for mobile app users';
COMMENT ON COLUMN public.push_notification_tokens.token IS 'Expo push notification token';
COMMENT ON COLUMN public.push_notification_tokens.platform IS 'Platform: ios, android, or web';















