/**
 * Email signup confirmation + password recovery OTP field count in the app.
 * Kept in one place next to Supabase: `chaincola-web/supabase/config.toml` → `[auth.email] otp_length = 6`.
 *
 * Hosted project: from `chaincola-web`, with CLI linked (`supabase link`), run `npx supabase config push`
 * so Auth uses 6-digit emails; or set Dashboard → Authentication → Providers → Email → OTP length → 6.
 */
export const AUTH_EMAIL_OTP_LENGTH = 6;
