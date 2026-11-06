import { Text, View } from 'react-native';

import { FlagBadge } from '@/components';
import { colors, spacing } from '@/theme';
import { useCoachPick } from './useCoachPick';

/** Compact coach line for read-only day views (league cards): country flag +
 *  coach surname + points. Renders nothing when the target user has no coach pick. */
export function CoachLine({
  gameDay,
  userId,
  compact = false,
}: {
  gameDay: string;
  userId?: string;
  compact?: boolean;
}) {
  const { pick, points } = useCoachPick(gameDay, userId);
  if (!pick) return null;
  const size = compact ? 11 : 12;
  const surname = pick.name.split(' ').slice(-1)[0] || pick.name;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <FlagBadge uri={pick.team.flag_url} code={pick.team.code} variant="round" size={size + 5} />
      <Text style={{ color: colors.text, fontSize: size, fontWeight: '600' }} numberOfLines={1}>
        {surname}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: size }}>· {points ?? 0} pts</Text>
    </View>
  );
}
