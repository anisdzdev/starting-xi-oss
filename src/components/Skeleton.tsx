import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

type Props = {
  width?: DimensionValue;
  height?: number;
  /** full circle (e.g. avatar placeholder) */
  circle?: boolean;
  radius?: number;
};

/** Shimmer block: animated gradient sweep over a base tone. Web + native identical. */
export function Skeleton({ width = '100%', height = 16, circle = false, radius = 8 }: Props) {
  const c = useThemeColors();
  const sweep = useSharedValue(-1);

  useEffect(() => {
    sweep.set(
      withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false)
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * 220 }],
  }));

  const size = circle ? { width: height, height } : { width, height };

  return (
    <View
      style={[
        size,
        { borderRadius: circle ? height / 2 : radius, backgroundColor: c.skeletonBase },
        styles.clip,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
        <LinearGradient
          colors={['transparent', c.skeletonHighlight, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** Common loading layout: avatar + two text lines. */
export function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-md">
      <Skeleton circle height={40} />
      <View className="flex-1 gap-sm">
        <Skeleton width="62%" height={14} />
        <Skeleton width="38%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
