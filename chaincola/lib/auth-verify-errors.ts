/**
 * Maps Supabase Auth errors from verifyOtp into user-facing copy.
 * GoTrue often returns "expired or invalid" in one message — avoid blaming only expiry.
 */
export function formatVerifyOtpUserMessage(error: unknown): string {
  const e = error as { message?: string; code?: string };
  const msg = (e?.message || '').trim();
  const code = (e?.code || '').toLowerCase();
  const lower = msg.toLowerCase();

  if (code === 'otp_expired') {
    return 'This verification code has expired. Request a new code from your email.';
  }

  if (lower.includes('invalid') && lower.includes('expired')) {
    return 'That code is incorrect or no longer valid. Check the latest email or tap Resend for a new code.';
  }

  if (lower.includes('invalid') || code === 'otp_disabled' || code === 'bad_jwt') {
    return 'Invalid verification code. Check the digits and try again, or request a new code.';
  }

  if (lower.includes('expired')) {
    return 'This verification code has expired. Request a new code from your email.';
  }

  return msg || 'Verification failed. Please try again.';
}
