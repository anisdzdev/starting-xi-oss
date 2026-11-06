import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

import type { PickedPlayer } from './store';

const SIZE = 44;

type Props = {
  player: PickedPlayer;
  /** Pixel positions inside the pitch container. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  onArrive: () => void;
};

/**
 * A player bubble that springs from the picker (bottom of the pitch) into its
 * slot. Rendered as a pitch overlay; explicit styles (reanimated — no className).
 */
export function FlyingChip({ player, from, to, onArrive }: Props) {
  const c = useThemeColors();
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(
      withSpring(1, { damping: 16, stiffness: 130, mass: 0.9 }, (finished) => {
        if (finished) runOnJS(onArrive)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: from.x + (to.x - from.x) * t.value - SIZE / 2,
    top: from.y + (to.y - from.y) * t.value - SIZE / 2,
    transform: [{ scale: 1.35 - 0.35 * t.value }],
    zIndex: 20,
  }));

  return (
    <Animated.View style={style} pointerEvents="none">
      <View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 2,
          borderColor: c.primary,
          backgroundColor: c.surfaceRaised,
          overflow: 'hidden',
          shadowColor: c.primary,
          shadowOpacity: 0.55,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Image
          source={player.imageUrl}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      </View>
    </Animated.View>
  );
}
