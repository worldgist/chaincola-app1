import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

/**
 * Redirect target for Supabase email actions (signup confirm, password recovery).
 * Register every variant Expo prints (exp://..., chaincola://...) in:
 * Supabase Dashboard → Authentication → URL configuration → Redirect URLs
 */
export function getSupabaseAuthRedirectTo(path: string = 'auth/callback'): string {
  return Linking.createURL(path);
}

export function parseSupabaseAuthTokensFromUrl(url: string): {
  access_token: string | null;
  refresh_token: string | null;
  type: string | null;
  /** PKCE / server-side redirect flow */
  code: string | null;
} {
  const out = {
    access_token: null as string | null,
    refresh_token: null as string | null,
    type: null as string | null,
    code: null as string | null,
  };
  const apply = (segment: string) => {
    if (!segment) return;
    const q = segment.startsWith('?') || segment.startsWith('#') ? segment.slice(1) : segment;
    const params = new URLSearchParams(q);
    if (!out.access_token) out.access_token = params.get('access_token');
    if (!out.refresh_token) out.refresh_token = params.get('refresh_token');
    if (!out.type) out.type = params.get('type');
    if (!out.code) out.code = params.get('code');
  };
  const hash = url.indexOf('#');
  if (hash >= 0) apply(url.slice(hash + 1));
  const q = url.indexOf('?');
  if (q >= 0) {
    const end = hash > q ? hash : url.length;
    apply(url.slice(q, end));
  }
  return out;
}

export type AuthEmailRedirectFlow = 'recovery' | 'signup' | 'general';

function flowFromParsedType(type: string | null): AuthEmailRedirectFlow {
  if (type === 'recovery') return 'recovery';
  if (type === 'signup' || type === 'email' || type === 'magiclink') return 'signup';
  return 'general';
}

function flowFromUserRecoveryFlag(user: { recovery_sent_at?: string | null } | null | undefined): AuthEmailRedirectFlow {
  if (user?.recovery_sent_at) return 'recovery';
  return 'general';
}

/**
 * Completes Supabase auth from an email deep link or in-app callback URL.
 * Supports implicit tokens (hash/query) and PKCE (`code` + exchangeCodeForSession).
 */
export async function establishSessionFromAuthRedirectUrl(
  url: string | null
): Promise<{ success: boolean; flow: AuthEmailRedirectFlow; error?: string }> {
  if (!url || !url.trim()) {
    return { success: false, flow: 'general', error: 'Missing URL' };
  }

  const parsed = parseSupabaseAuthTokensFromUrl(url);
  let flow = flowFromParsedType(parsed.type);

  if (parsed.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) {
      console.error('exchangeCodeForSession:', error.message);
      return { success: false, flow, error: error.message };
    }
    if (!data.session) {
      return { success: false, flow, error: 'No session after code exchange' };
    }
    if (flow === 'general') {
      const r = flowFromUserRecoveryFlag(data.session.user);
      if (r === 'recovery') flow = 'recovery';
    }
    return { success: true, flow };
  }

  if (parsed.access_token && parsed.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) {
      console.error('setSession from redirect URL:', error.message);
      return { success: false, flow, error: error.message };
    }
    if (flow === 'general' && data.session?.user) {
      const r = flowFromUserRecoveryFlag(data.session.user);
      if (r === 'recovery') flow = 'recovery';
    }
    return { success: true, flow };
  }

  return { success: false, flow: 'general', error: 'No auth code or tokens in URL' };
}
