import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

/** Live indicator: a dot with a breathing halo. UI-thread loop, web-safe. */
export function PulsingDot({ size = 8, color }: { size?: number; color?: string }) {
  const c = useThemeColors();
  const dotColor = color ?? c.live;
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(
      withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.5 - pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));

  return (
    <Animated.View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          halo,
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: dotColor,
          },
        ]}
      />
      <Animated.View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dotColor }}
      />
    </Animated.View>
  );
}
