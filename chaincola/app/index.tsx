import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';

export default function Index() {
  useEffect(() => {
    // Navigate to onboarding after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/onboarding');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('@/assets/logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  logoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
  },
});


