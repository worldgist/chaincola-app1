import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ThemedText } from './themed-text';

interface ChainColaSpinnerProps {
  size?: number;
  color?: string;
}

export default function ChainColaSpinner({ 
  size = 64, 
  color = '#6B46C1' 
}: ChainColaSpinnerProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    rotate.start();

    return () => rotate.stop();
  }, [rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.spinnerContainer,
          {
            width: size,
            height: size,
            transform: [{ rotate: rotation }],
          },
        ]}
      >
        <ThemedText
          style={[
            styles.spinnerText,
            {
              fontSize: size * 0.6,
              color: color,
            },
          ]}
        >
          C
        </ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerText: {
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
