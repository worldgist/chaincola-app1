import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_PROJECT_REF } from '@/constants/supabase';

// Get Supabase URL and anon key from environment variables
// Use same environment variable names as website (NEXT_PUBLIC_*) for shared backend
// Priority: Constants.expoConfig.extra > process.env (for runtime) > constants/supabase.json
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     SUPABASE_URL;
                     
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                        SUPABASE_ANON_KEY;

// Debug logging (only in development)
if (__DEV__) {
  console.log('🔗 Supabase Configuration:');
  console.log('   URL:', supabaseUrl);
  console.log('   Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'MISSING');
  console.log('   Source:', Constants.expoConfig?.extra?.supabaseUrl ? 'app.config.js' : 'process.env');
}

if (!supabaseAnonKey || supabaseAnonKey === '' || supabaseAnonKey === 'placeholder-key') {
  console.error('❌ Supabase anon key not set. Connection will fail.');
  console.error('Please set NEXT_PUBLIC_SUPABASE_ANON_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY) in your .env file or app.config.js');
  console.error(`Get your key from: https://app.supabase.com/project/${SUPABASE_PROJECT_REF}/settings/api`);
}

function requestHref(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Merge timeout + caller signal so GoTrue can cancel superseded requests without breaking fetch. */
function mergeWithTimeoutSignal(
  incoming: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const clearTimer = () => clearTimeout(timeoutId);

  if (!incoming) {
    return {
      signal: timeoutController.signal,
      cleanup: clearTimer,
    };
  }
  if (incoming.aborted) {
    clearTimer();
    const already = new AbortController();
    already.abort();
    return { signal: already.signal, cleanup: () => {} };
  }

  const anyFn = (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') {
    return {
      signal: anyFn([incoming, timeoutController.signal]),
      cleanup: clearTimer,
    };
  }

  const merged = new AbortController();
  const forward = () => {
    if (!merged.signal.aborted) merged.abort();
  };
  incoming.addEventListener('abort', forward);
  timeoutController.signal.addEventListener('abort', forward);
  return {
    signal: merged.signal,
    cleanup: () => {
      clearTimer();
      incoming.removeEventListener('abort', forward);
      timeoutController.signal.removeEventListener('abort', forward);
    },
  };
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Add better error handling and timeout configuration
    global: {
      headers: {
        'x-client-info': 'chaincola-mobile',
      },
      // Increase timeout for mobile networks (60 seconds for storage uploads, 30 seconds for other operations)
      fetch: (url, options = {}) => {
        const href = requestHref(url);
        const isStorageOperation = href.includes('/storage/v1/') || href.includes('/storage/v1/object/');
        const isRestQuery = href.includes('/rest/v1/');
        const isAuth = href.includes('/auth/v1/');
        // PostgREST + tunnel / slow mobile: 30s aborts were causing DOMException "AbortError" on wallet loads
        const timeoutMs = isStorageOperation ? 60000 : isRestQuery ? 55000 : isAuth ? 60000 : 30000;
        const { signal, cleanup } = mergeWithTimeoutSignal(options.signal, timeoutMs);

        return fetch(url, {
          ...options,
          signal,
        }).finally(cleanup);
      },
    },
  }
);

