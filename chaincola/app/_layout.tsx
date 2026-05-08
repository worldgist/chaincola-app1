import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';
// Import WebCrypto polyfill before Supabase
import '@/lib/webcrypto-polyfill';
// Initialize push notification handler early
import '@/lib/push-notification-service';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { parseSupabaseAuthTokensFromUrl } from '@/lib/supabase-auth-redirect';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Component to handle deeplinks
function DeeplinkHandler() {
  const router = useRouter();
  const { user } = useAuth();

  const handleDeeplink = useCallback(async (url: string) => {
    console.log('🔗 Deeplink received:', url);

    if (url.includes('access_token=') && url.includes('refresh_token=')) {
      const { access_token, refresh_token, type } = parseSupabaseAuthTokensFromUrl(url);
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error('❌ Supabase session from link:', error.message);
          router.replace('/auth/signin');
          return;
        }
        if (type === 'recovery') {
          router.replace('/auth/reset-password');
        } else {
          router.replace('/(tabs)');
        }
        return;
      }
    }

    try {
      const parsed = Linking.parse(url);
      const { hostname, path, queryParams } = parsed;

      // Handle payment callback deeplink
      if (hostname === 'home' || path === '/home') {
        const paymentStatus = queryParams?.payment || queryParams?.status;
        
        if (paymentStatus === 'successful' || paymentStatus === 'success') {
          console.log('✅ Payment successful, navigating to home...');
          
          // Navigate to home page (tabs)
          if (user) {
            router.replace('/(tabs)');
          } else {
            router.replace('/');
          }
        } else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
          console.log('❌ Payment failed or cancelled');
          // Still navigate to home, but could show error message
          if (user) {
            router.replace('/(tabs)');
          } else {
            router.replace('/');
          }
        } else {
          // Just navigate to home
          if (user) {
            router.replace('/(tabs)');
          } else {
            router.replace('/');
          }
        }
      }
      // Handle payment-callback deeplink (backward compatibility)
      else if (hostname === 'payment-callback' || path === '/payment-callback') {
        const status = queryParams?.status;
        console.log('💳 Payment callback received:', status);
        
        if (status === 'successful' || status === 'success') {
          if (user) {
            router.replace('/(tabs)');
          } else {
            router.replace('/');
          }
        } else {
          if (user) {
            router.replace('/(tabs)');
          } else {
            router.replace('/');
          }
        }
      }
    } catch (error) {
      console.error('❌ Error handling deeplink:', error);
    }
  }, [router, user]);

  useEffect(() => {
    // Handle initial URL (app opened via deeplink)
    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleDeeplink(url);
      }
    });

    // Handle URL when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      void handleDeeplink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeeplink]);

  return null;
}

function AppContent() {
  const colorScheme = useColorScheme();
  // Ensure we're within AuthProvider context
  const { loading: authLoading } = useAuth();
  
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DeeplinkHandler />
      <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="splash" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="transaction-detail" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="fund-wallet" options={{ headerShown: false }} />
          <Stack.Screen name="withdraw" options={{ headerShown: false }} />
          <Stack.Screen name="crypto/[symbol]" options={{ headerShown: false }} />
          <Stack.Screen name="send-crypto" options={{ headerShown: false }} />
          <Stack.Screen name="sell-crypto" options={{ headerShown: false }} />
          <Stack.Screen name="buy-crypto" options={{ headerShown: false }} />
          <Stack.Screen name="convert-crypto" options={{ headerShown: false }} />
          <Stack.Screen name="all-services" options={{ headerShown: false }} />
          <Stack.Screen name="wallet-ngn" options={{ headerShown: false }} />
          <Stack.Screen name="betting" options={{ headerShown: false }} />
          {/* Paybills features hidden - only gift cards available */}
          {/* <Stack.Screen name="buy-airtime" options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="buy-data" options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="buy-cable-tv" options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="buy-electricity" options={{ headerShown: false }} /> */}
          <Stack.Screen name="buy-gift-card" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

