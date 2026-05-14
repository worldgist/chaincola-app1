import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, G } from 'react-native-svg';

const LogoAsset = require('@/assets/logo.png');

type LogoCircularProgressLoaderProps = {
  size?: number;
  trackColor?: string;
  strokeColor?: string;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Indeterminate circular progress: rotating arc around the app logo.
 */
export default function LogoCircularProgressLoader({
  size = 32,
  trackColor = 'rgba(255,255,255,0.28)',
  strokeColor = '#FFFFFF',
  durationMs = 900,
  style,
}: LogoCircularProgressLoaderProps) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      rotation.setValue(0);
    };
  }, [durationMs, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const strokeWidth = Math.max(2, size * 0.09);
  const r = (size - strokeWidth) / 2 - 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const dashArc = c * 0.32;

  const logoSize = size * 0.46;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
      </Svg>
      <Animated.View
        style={[
          styles.spinnerLayer,
          { width: size, height: size },
          { transform: [{ rotate: spin }] },
        ]}
      >
        <Svg width={size} height={size}>
          <G transform={`rotate(-90 ${cx} ${cy})`}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${dashArc} ${c}`}
              fill="none"
            />
          </G>
        </Svg>
      </Animated.View>
      <Image
        source={LogoAsset}
        style={{
          width: logoSize,
          height: logoSize,
          borderRadius: logoSize * 0.2,
        }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
