import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { establishSessionFromAuthRedirectUrl } from '@/lib/supabase-auth-redirect';
import AppLoadingIndicator from '@/components/app-loading-indicator';


/**
 * Target route for Supabase email redirects (signup / password recovery).
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    const applySession = async (url: string | null) => {
      const result = await establishSessionFromAuthRedirectUrl(url);
      if (!result.success) {
        router.replace('/auth/signin');
        return;
      }
      if (result.flow === 'recovery') {
        router.replace('/auth/reset-password');
      } else {
        router.replace('/(tabs)');
      }
    };

    void Linking.getInitialURL().then(applySession);
    const sub = Linking.addEventListener('url', (e) => {
      void applySession(e.url);
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      <AppLoadingIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
