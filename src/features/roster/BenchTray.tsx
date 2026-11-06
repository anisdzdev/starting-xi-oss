import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

import type { PickedPlayer } from './store';

type Props = {
  players: PickedPlayer[];
  onPlace: (playerId: number) => void;
};

/**
 * Reassignment tray: players benched by a formation switch. Tapping a player
 * drops them into the first free slot of their line (if one exists).
 */
export function BenchTray({ players, onPlace }: Props) {
  const c = useThemeColors();
  if (players.length === 0) return null;

  return (
    <View className="gap-sm border-t border-border bg-surfaceRaised px-lg py-md">
      <Text className="text-xs font-semibold uppercase tracking-widest text-warning">
        Bench — tap to reassign
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-md">
        {players.map((p) => (
          <Pressable key={p.id} onPress={() => onPlace(p.id)} className="items-center gap-xs active:opacity-70">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1.6,
                borderColor: c.warning,
                backgroundColor: c.surface,
                overflow: 'hidden',
              }}
            >
              <Image
                source={p.imageUrl}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <Text className="max-w-[64px] text-center text-xs text-textMuted" numberOfLines={1}>
              {p.name.split(' ').slice(-1)[0]} · {p.position}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
