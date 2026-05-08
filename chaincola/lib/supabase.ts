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
        const controller = new AbortController();
        // Use longer timeout for storage operations (file uploads)
        const isStorageOperation = url.includes('/storage/v1/') || url.includes('/storage/v1/object/');
        const isRestQuery = url.includes('/rest/v1/');
        // PostgREST + tunnel / slow mobile: 30s aborts were causing DOMException "AbortError" on wallet loads
        const timeout = isStorageOperation ? 60000 : isRestQuery ? 55000 : 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
    },
  }
);

