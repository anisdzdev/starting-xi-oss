import { format, parseISO } from 'date-fns';
import { Gift, Users } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { Round } from '@/features/rounds';
import { useThemeColors } from '@/theme';

import { goalLabel } from './goal';
import type { Competition, CompetitionStatus } from './types';

const STATUS_LABEL: Record<CompetitionStatus, string> = {
  open: 'Open',
  live: 'Live',
  finished: 'Finished',
};

/** Small status pill: green while open to join, live-red while playing, muted when done. */
export function StatusPill({ status }: { status: CompetitionStatus }) {
  const c = useThemeColors();
  const color = status === 'open' ? c.primary : status === 'live' ? c.live : c.textMuted;
  return (
    <View
      className="rounded-full border px-sm py-[2px]"
      style={{ borderColor: color, backgroundColor: `${color}22` }}
    >
      <Text className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

type Props = {
  competition: Competition;
  rounds: Round[];
  onPress: () => void;
};

/** List card: name + status, goal, reward, member count, your relationship to it. */
export function CompetitionCard({ competition: comp, rounds, onPress }: Props) {
  const c = useThemeColors();
  const when =
    comp.startsOn && comp.endsOn
      ? comp.startsOn === comp.endsOn
        ? format(parseISO(comp.startsOn), 'EEE, MMM d')
        : `${format(parseISO(comp.startsOn), 'MMM d')} – ${format(parseISO(comp.endsOn), 'MMM d')}`
      : '';
  return (
    <Pressable
      onPress={onPress}
      className="gap-sm rounded-xl border border-border bg-surface px-lg py-md active:opacity-80"
    >
      <View className="flex-row items-center gap-sm">
        <Text className="flex-1 text-base font-bold text-text" numberOfLines={1}>
          {comp.name}
        </Text>
        <StatusPill status={comp.status} />
      </View>
      <Text className="text-sm text-textMuted" numberOfLines={1}>
        {goalLabel(comp, rounds)}
        {when ? ` · ${when}` : ''}
      </Text>
      {comp.reward ? (
        <View className="flex-row items-center gap-xs">
          <Gift size={14} color={c.captain} strokeWidth={2.2} />
          <Text className="flex-1 text-sm text-text" numberOfLines={1}>
            {comp.reward}
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-center gap-sm">
        <Users size={14} color={c.textFaint} strokeWidth={2.2} />
        <Text className="text-xs text-textFaint">
          {comp.memberCount} in · by {comp.creatorName}
        </Text>
        <View className="flex-1" />
        {comp.me.joined ? (
          <Text className="text-xs font-bold" style={{ color: c.primary }}>
            Joined
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
