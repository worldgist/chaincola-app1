import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  /** Price points, oldest to newest. */
  data: number[];
  width: number;
  height: number;
  /** Stroke + fill color hint. If omitted we infer from start/end direction. */
  color?: string;
  loading?: boolean;
  /** Vertical inset so peaks/troughs are not clipped against the edges. */
  verticalPadding?: number;
}

/**
 * Renders a smooth-ish line chart using `react-native-svg`. The path uses
 * straight segments (matching the slightly-jagged style in the design),
 * with a soft gradient fill underneath and a marker at the latest point.
 *
 * No data manipulation beyond min/max scaling — caller is responsible for
 * how many samples to display. Empty/single-point data renders nothing.
 */
export default function CryptoPriceChart({
  data,
  width,
  height,
  color,
  loading,
  verticalPadding = 12,
}: Props) {
  const { linePath, areaPath, lastPoint, strokeColor } = useMemo(() => {
    const fallback = { linePath: '', areaPath: '', lastPoint: null as null | { x: number; y: number }, strokeColor: color ?? '#10B981' };
    if (!data || data.length < 2) return fallback;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const usableHeight = Math.max(1, height - verticalPadding * 2);
    const stepX = data.length > 1 ? width / (data.length - 1) : width;

    const points = data.map((value, i) => {
      const x = i * stepX;
      const y = verticalPadding + usableHeight - ((value - min) / range) * usableHeight;
      return { x, y };
    });

    const linePathStr = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const areaPathStr = `${linePathStr} L ${points[points.length - 1].x.toFixed(2)} ${height} L ${points[0].x.toFixed(2)} ${height} Z`;

    // Auto color: green when ending above the start, red otherwise.
    const inferredColor = data[data.length - 1] >= data[0] ? '#10B981' : '#EF4444';

    return {
      linePath: linePathStr,
      areaPath: areaPathStr,
      lastPoint: points[points.length - 1],
      strokeColor: color ?? inferredColor,
    };
  }, [data, width, height, verticalPadding, color]);

  if (loading) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <ActivityIndicator size="small" color="#9CA3AF" />
      </View>
    );
  }

  if (!linePath) {
    return <View style={[styles.placeholder, { width, height }]} />;
  }

  // SVG defs need a stable, unique id per instance to avoid leaking across mounts
  const gradientId = `chartGradient-${strokeColor.replace('#', '')}`;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={strokeColor} stopOpacity="0.18" />
            <Stop offset="1" stopColor={strokeColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill={`url(#${gradientId})`} />
        <Path
          d={linePath}
          stroke={strokeColor}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {lastPoint && (
          <>
            <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill="#FFFFFF" stroke={strokeColor} strokeWidth={2} />
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
