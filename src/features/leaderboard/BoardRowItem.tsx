import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { useThemeColors } from '@/theme';

import type { BoardRow } from './useLeaderboard';

// Podium colours are a deliberate one-off (gold/silver/bronze medals), not theme tokens.
export const PODIUM = ['#F5C543', '#C7CEDB', '#D08A4E']; // gold / silver / bronze

function Movement({ value }: { value: number | null }) {
  const c = useThemeColors();
  if (value === null || value === 0) {
    return <Minus size={13} color={c.textFaint} strokeWidth={2.2} />;
  }
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <View className="flex-row items-center">
      <Icon size={13} color={value > 0 ? c.rankUp : c.rankDown} strokeWidth={2.6} />
      <Text
        className="text-xs font-bold"
        style={{ color: value > 0 ? c.rankUp : c.rankDown }}
      >
        {Math.abs(value)}
      </Text>
    </View>
  );
}

/**
 * One standings row (rank badge, movement, avatar, name/sub, optional pick image,
 * points). Shared by the Standings boards and competition standings. Tapping opens
 * the user's team for `gameDay` (today when omitted); `onPress` overrides that.
 */
export const BoardRowItem = memo(function BoardRowItem({
  row,
  gameDay,
  onPress,
}: {
  row: BoardRow;
  gameDay?: string;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  const podium = row.rank <= 3 ? PODIUM[row.rank - 1] : null;

  return (
    <Pressable
      onPress={
        onPress ??
        (() =>
          router.push(
            gameDay ? `/team/${row.userId}?gameDay=${gameDay}` : `/team/${row.userId}`
          ))
      }
      className={`mb-sm flex-row items-center gap-md rounded-xl border px-md py-sm active:opacity-80 ${
        podium ? 'bg-surfaceGlass' : 'bg-surface'
      }`}
      style={{ borderColor: podium ? `${podium}55` : c.border }}
    >
      {/* rank badge */}
      <View
        className="h-[30px] w-[30px] items-center justify-center rounded-full"
        style={{ backgroundColor: podium ?? c.surfaceRaised }}
      >
        <Text
          className="text-sm font-bold"
          style={{ color: podium ? '#221A02' : c.textMuted }}
        >
          {row.rank}
        </Text>
      </View>

      <Movement value={row.movement} />

      <Avatar uri={row.avatarUrl} name={row.name} size={podium ? 40 : 34} />

      <View className="flex-1">
        <Text className="text-base font-semibold text-text" numberOfLines={1}>
          {row.name}
        </Text>
        {row.sub ? (
          <Text className="text-xs text-textMuted" numberOfLines={1}>
            {row.sub}
          </Text>
        ) : null}
      </View>

      {row.pickImageUrl ? (
        <Avatar uri={row.pickImageUrl} size={26} />
      ) : null}

      <Text
        className="min-w-[40px] text-right text-lg font-bold"
        style={{ color: podium ?? c.text }}
      >
        {row.points}
      </Text>
    </Pressable>
  );
});

