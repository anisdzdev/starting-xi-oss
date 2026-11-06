import { Image } from 'expo-image';
import { Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radii, useThemeColors } from '@/theme';
import type { Position } from '@/shared/scoring';

import type { PickedPlayer } from './store';

const SLOT_W = 64;

type Props = {
  position: Position;
  player: PickedPlayer | null;
  isCaptain?: boolean;
  /** Percent coordinates of the slot center on the pitch. */
  x: number;
  y: number;
  onPress: () => void;
};

/** Pulsing dashed "+" affordance for an empty slot (explicit styles — reanimated). */
function EmptyBubble({ position }: { position: Position }) {
  const c = useThemeColors();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(
      withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.94 + pulse.value * 0.1 }],
  }));

  return (
    <Animated.View
      style={[
        pulseStyle,
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1.6,
          borderStyle: 'dashed',
          borderColor: c.primary,
          backgroundColor: `${c.primary}14`,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Plus size={18} color={c.primary} strokeWidth={2.4} />
    </Animated.View>
  );
}

function FilledBubble({ player, isCaptain }: { player: PickedPlayer; isCaptain: boolean }) {
  const c = useThemeColors();
  return (
    <View className="items-center">
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 2,
          borderColor: isCaptain ? c.captain : c.borderGlass,
          backgroundColor: c.surfaceRaised,
          overflow: 'hidden',
          // subtle gold glow for the armband holder
          shadowColor: isCaptain ? c.captain : 'transparent',
          shadowOpacity: isCaptain ? 0.75 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: isCaptain ? 8 : 0,
        }}
      >
        <Image
          source={player.imageUrl}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
        />
      </View>
      {isCaptain ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -2,
            backgroundColor: c.captain,
            borderRadius: radii.full,
            width: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#2B2002' }}>C</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PlayerSlot({ position, player, isCaptain = false, x, y, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: SLOT_W,
        marginLeft: -SLOT_W / 2,
        alignItems: 'center',
      }}
    >
      {player ? (
        <FilledBubble player={player} isCaptain={isCaptain} />
      ) : (
        <EmptyBubble position={position} />
      )}
      <View className="mt-xs max-w-[76px] flex-row items-center justify-center gap-[3px] rounded-sm bg-overlay px-xs py-[1px]">
        {player?.flagUrl ? (
          <Image
            source={player.flagUrl}
            style={{ width: 11, height: 11, borderRadius: 6 }}
            contentFit="cover"
            transition={120}
          />
        ) : null}
        <Text numberOfLines={1} className="shrink text-center text-xs font-semibold text-text">
          {player ? player.name.split(' ').slice(-1)[0] : position}
        </Text>
      </View>
    </Pressable>
  );
}
