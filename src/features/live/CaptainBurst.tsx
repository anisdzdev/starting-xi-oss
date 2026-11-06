import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { wc } from '@/theme';

const COLORS = [wc.gold, wc.cyan, wc.pink, wc.lime, wc.purple, wc.orange];
const PARTICLES = 14;

function Particle({ index }: { index: number }) {
  const t = useSharedValue(0);
  // deterministic spread — no Math.random so re-renders are stable
  const angle = (index / PARTICLES) * Math.PI * 2 + (index % 3) * 0.35;
  const dist = 46 + (index % 5) * 14;
  const color = COLORS[index % COLORS.length];

  useEffect(() => {
    t.set(
      withDelay(
        (index % 4) * 60,
        withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) })
      )
    );
  }, [t, index]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value - 26 * t.value },
      { rotate: `${t.value * 260 * (index % 2 === 0 ? 1 : -1)}deg` },
      { scale: 1 - 0.35 * t.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: index % 3 === 0 ? 9 : 7,
          height: index % 3 === 0 ? 9 : 7,
          borderRadius: index % 2 === 0 ? 2 : 5,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Confetti burst over the captain's slot when they score. Remount with a new
 * `key` to replay; particles fade themselves out (pure UI-thread transforms).
 */
export function CaptainBurst({ x, y }: { x: number; y: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 30 }}
    >
      {Array.from({ length: PARTICLES }, (_, i) => (
        <Particle key={i} index={i} />
      ))}
    </View>
  );
}
