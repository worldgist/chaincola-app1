import * as Linking from 'expo-linking';

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
} {
  const out = {
    access_token: null as string | null,
    refresh_token: null as string | null,
    type: null as string | null,
  };
  const apply = (segment: string) => {
    if (!segment) return;
    const q = segment.startsWith('?') || segment.startsWith('#') ? segment.slice(1) : segment;
    const params = new URLSearchParams(q);
    if (!out.access_token) out.access_token = params.get('access_token');
    if (!out.refresh_token) out.refresh_token = params.get('refresh_token');
    if (!out.type) out.type = params.get('type');
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
