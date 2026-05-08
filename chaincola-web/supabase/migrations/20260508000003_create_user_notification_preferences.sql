-- Create the user_notification_preferences table that the mobile app already
-- targets via `notification-preferences-service.ts`. Without this table the
-- service falls back to `user_profiles`, which is brittle when older rows are
-- missing the boolean columns or when only one preference is being toggled.
--
-- Defaults are TRUE so brand-new users opt into notifications by default,
-- mirroring the previous user_profiles behavior.

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id
  ON public.user_notification_preferences(user_id);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS, matching the rest of the project's user-scoped tables.
DROP POLICY IF EXISTS "Users can view own notification preferences"
  ON public.user_notification_preferences;
CREATE POLICY "Users can view own notification preferences"
  ON public.user_notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences"
  ON public.user_notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON public.user_notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences"
  ON public.user_notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON public.user_notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification preferences"
  ON public.user_notification_preferences;
CREATE POLICY "Users can delete own notification preferences"
  ON public.user_notification_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access on notification preferences"
  ON public.user_notification_preferences;
CREATE POLICY "Service role full access on notification preferences"
  ON public.user_notification_preferences
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_user_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_notification_preferences_updated_at
  ON public.user_notification_preferences;
CREATE TRIGGER trg_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_notification_preferences_updated_at();

-- Backfill from user_profiles so existing users keep their previously-saved
-- preferences after the table comes online. We use COALESCE in case the
-- columns don't exist on every row (defaults guarantee TRUE).
INSERT INTO public.user_notification_preferences (
  user_id,
  push_notifications_enabled,
  email_notifications_enabled
)
SELECT
  up.user_id,
  COALESCE(up.push_notifications, TRUE),
  COALESCE(up.email_notifications, TRUE)
FROM public.user_profiles up
WHERE up.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE public.user_notification_preferences
  IS 'Per-user push/email notification preferences. Owner-only RLS.';
