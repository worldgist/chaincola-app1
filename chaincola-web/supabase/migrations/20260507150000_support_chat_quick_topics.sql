-- Quick-topic chips for live support chat (editable in DB; loaded by apps).

CREATE TABLE IF NOT EXISTS public.support_chat_quick_topics (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  auto_reply TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_chat_quick_topics_active_sort
  ON public.support_chat_quick_topics (is_active, sort_order);

COMMENT ON TABLE public.support_chat_quick_topics IS 'Support chat preset topics; prompt sent as user message; auto_reply shown client-side.';

ALTER TABLE public.support_chat_quick_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active support quick topics"
  ON public.support_chat_quick_topics
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins insert support chat quick topics"
  ON public.support_chat_quick_topics
  FOR INSERT
  WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY "Admins update support chat quick topics"
  ON public.support_chat_quick_topics
  FOR UPDATE
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY "Admins delete support chat quick topics"
  ON public.support_chat_quick_topics
  FOR DELETE
  USING (public.is_user_admin(auth.uid()));

INSERT INTO public.support_chat_quick_topics (slug, label, prompt, auto_reply, sort_order, is_active)
VALUES
  (
    'frozen',
    'Frozen account',
    'I need help with a frozen or restricted account.',
    'Thanks for letting us know. A support agent will review your account. You may be asked to verify your identity. Please keep details in this chat only and avoid opening duplicate tickets.',
    10,
    true
  ),
  (
    'withdrawal',
    'Withdrawal issues',
    'I need help with a withdrawal (delay, failed payout, or missing funds).',
    'We have noted a withdrawal-related request. When an agent joins, share your bank name and the approximate time of the withdrawal if you can. They will check payout and transaction status on our side.',
    20,
    true
  ),
  (
    'login',
    'Login / access',
    'I cannot sign in or I am locked out of my account.',
    'For sign-in problems, try "Forgot password" on the sign-in screen first. If that does not work, stay in this chat — an agent can help confirm the email or phone on your profile.',
    30,
    true
  ),
  (
    'other',
    'Something else',
    'I have a different question for support.',
    'No problem. Describe your issue in your next message and our team will pick it up here as soon as they are available.',
    40,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  prompt = EXCLUDED.prompt,
  auto_reply = EXCLUDED.auto_reply,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
