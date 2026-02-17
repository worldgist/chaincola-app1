import { Image } from 'expo-image';
import { StyleSheet, View, ScrollView, TouchableOpacity, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useState, useRef } from 'react';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const onboardingSlides = [
  {
    id: 1,
    image: require('@/assets/phone.png'),
    title: 'Welcome to ChainCola',
    subtitle: 'Your trusted cryptocurrency wallet and exchange platform',
  },
  {
    id: 2,
    image: require('@/assets/phone1.png'),
    title: 'Manage Your Crypto',
    subtitle: 'Buy, sell, send, and receive cryptocurrencies with ease',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleGetStarted = () => {
    try {
      console.log('Get Started button pressed');
      router.replace('/auth/signin');
    } catch (error) {
      console.error('Error navigating to signin:', error);
      // Fallback navigation
      router.push('/auth/signin');
    }
  };

  const handleSkip = () => {
    try {
      console.log('Skip button pressed');
      router.replace('/auth/signin');
    } catch (error) {
      console.error('Error navigating to signin:', error);
      // Fallback navigation
      router.push('/auth/signin');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.skipContainer} pointerEvents="box-none">
        <TouchableOpacity 
          onPress={handleSkip} 
          activeOpacity={0.7}
          disabled={false}
        >
          <ThemedText style={styles.skipText}>Skip</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {onboardingSlides.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            <View style={styles.slideContent}>
              <View style={styles.imageContainer}>
                <Image
                  source={slide.image}
                  style={styles.phoneImage}
                  contentFit="contain"
                />
              </View>
              <View style={styles.textContainer}>
                <ThemedText style={styles.title}>
                  {slide.title}
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                  {slide.subtitle}
                </ThemedText>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer} pointerEvents="box-none">
        <View style={styles.indicatorContainer} pointerEvents="none">
          {onboardingSlides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                currentIndex === index && styles.indicatorActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.buttonContainer}>
          {currentIndex === onboardingSlides.length - 1 ? (
            <TouchableOpacity
              style={styles.button}
              onPress={handleGetStarted}
              activeOpacity={0.8}
              disabled={false}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA', '#A855F7']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.buttonText}>Get Started</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                const nextIndex = currentIndex + 1;
                console.log('Next button pressed, scrolling to index:', nextIndex);
                scrollViewRef.current?.scrollTo({
                  x: SCREEN_WIDTH * nextIndex,
                  animated: true,
                });
              }}
              activeOpacity={0.8}
              disabled={false}
            >
              <LinearGradient
                colors={['#6B46C1', '#9333EA', '#A855F7']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.buttonText}>Next</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  skipContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 200,
  },
  imageContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  phoneImage: {
    width: '100%',
    height: 400,
    resizeMode: 'contain',
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    flexShrink: 1,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: '#fff',
    zIndex: 100,
    elevation: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  indicatorActive: {
    width: 24,
    backgroundColor: '#6B46C1',
  },
  buttonContainer: {
    paddingHorizontal: 20,
  },
  button: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonGradient: {
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

