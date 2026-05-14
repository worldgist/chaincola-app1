import type { StyleProp, ViewStyle } from 'react-native';
import LogoCircularProgressLoader from '@/components/logo-circular-progress-loader';

export type AppLoadingIndicatorSize = 'small' | 'medium' | 'large';

export type AppLoadingIndicatorVariant =
  /** Purple ring on light backgrounds (screens, cards). */
  | 'onLight'
  /** Light ring on dark / purple surfaces. */
  | 'onDark'
  /** White / lavender ring on primary gradient buttons. */
  | 'onPrimary'
  /** Subtle gray ring for inline / chart contexts. */
  | 'onMuted';

export type AppLoadingIndicatorProps = {
  size?: AppLoadingIndicatorSize;
  variant?: AppLoadingIndicatorVariant;
  style?: StyleProp<ViewStyle>;
  durationMs?: number;
};

const SIZE_PX: Record<AppLoadingIndicatorSize, number> = {
  small: 24,
  medium: 32,
  large: 44,
};

const VARIANT_COLORS: Record<
  AppLoadingIndicatorVariant,
  { trackColor: string; strokeColor: string }
> = {
  onLight: {
    trackColor: 'rgba(107, 70, 193, 0.22)',
    strokeColor: '#6B46C1',
  },
  onDark: {
    trackColor: 'rgba(255, 255, 255, 0.28)',
    strokeColor: '#EDE9FE',
  },
  onPrimary: {
    trackColor: 'rgba(255, 255, 255, 0.35)',
    strokeColor: '#EDE9FE',
  },
  onMuted: {
    trackColor: 'rgba(156, 163, 175, 0.35)',
    strokeColor: '#9CA3AF',
  },
};

/**
 * App-wide loading spinner: same logo + circular arc animation as bank withdraw.
 */
export default function AppLoadingIndicator({
  size = 'medium',
  variant = 'onLight',
  style,
  durationMs,
}: AppLoadingIndicatorProps) {
  const dim = SIZE_PX[size];
  const { trackColor, strokeColor } = VARIANT_COLORS[variant];
  return (
    <LogoCircularProgressLoader
      size={dim}
      trackColor={trackColor}
      strokeColor={strokeColor}
      durationMs={durationMs}
      style={style}
    />
  );
}
