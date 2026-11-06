import { router } from 'expo-router';
import { CheckCircle2, ClipboardList, Lock } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Button, Card, Skeleton } from '@/components';
import { useThemeColors } from '@/theme';

import type { MyRoster } from './useMyRoster';

type Props = {
  roster: MyRoster;
  /** First kickoff has passed — the XI is effectively locked even without locked_at. */
  dayStarted: boolean;
  /** Any match currently live (changes the points label). */
  hasLive: boolean;
  /** Set when the build day is a FUTURE day (e.g. "Wed, Jun 17"); names the day in CTA copy. */
  buildDayLabel?: string;
};

export function XIStatusCard({ roster, dayStarted, hasLive, buildDayLabel }: Props) {
  const c = useThemeColors();

  if (roster.loading) {
    return (
      <Card variant="elevated" className="gap-md">
        <Skeleton width="40%" height={14} />
        <Skeleton width="70%" height={22} />
        <Skeleton width="100%" height={48} radius={14} />
      </Card>
    );
  }

  const locked = roster.status === 'locked' || (roster.status !== 'none' && dayStarted);

  if (locked) {
    return (
      <Card variant="elevated" className="gap-md">
        <View className="flex-row items-center gap-xs">
          <Lock size={14} color={c.textMuted} strokeWidth={2.2} />
          <Text className="text-xs font-semibold uppercase tracking-widest text-textMuted">
            Your XI · Locked
          </Text>
        </View>
        <View className="flex-row items-end gap-sm">
          <Text className="text-display font-bold text-text">{roster.points ?? 0}</Text>
          <Text className="pb-sm text-sm text-textMuted">
            {hasLive ? 'live points' : 'points today'}
          </Text>
          {hasLive ? <View className="mb-md h-[8px] w-[8px] rounded-full bg-live" /> : null}
        </View>
        <Button title={hasLive ? 'Watch live' : 'View your XI'} onPress={() => router.push('/live')} />
      </Card>
    );
  }

  if (roster.status === 'building') {
    return (
      <Card variant="elevated" className="gap-md">
        <View className="flex-row items-center gap-xs">
          <ClipboardList size={14} color={c.accentCyan} strokeWidth={2.2} />
          <Text className="text-xs font-semibold uppercase tracking-widest text-textMuted">
            Your XI · In progress
          </Text>
        </View>
        <Text className="text-xl font-bold text-text">
          {roster.pickedCount} of 11 picked{buildDayLabel ? ` · ${buildDayLabel}` : ''}
        </Text>
        <Button
          title={roster.pickedCount >= 11 ? 'Make changes' : 'Finish your XI'}
          onPress={() => router.push('/roster')}
        />
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="gap-md">
      <View className="flex-row items-center gap-xs">
        <CheckCircle2 size={14} color={c.primary} strokeWidth={2.2} />
        <Text className="text-xs font-semibold uppercase tracking-widest text-textMuted">
          Your XI · Not started
        </Text>
      </View>
      <Text className="text-xl font-bold text-text">
        {buildDayLabel
          ? `Pick your team for ${buildDayLabel}`
          : dayStarted
            ? 'Too late for today'
            : 'Pick your team for today'}
      </Text>
      {!dayStarted ? (
        <Button title="Build your XI" onPress={() => router.push('/roster')} />
      ) : (
        <Button title="Watch live" variant="ghost" onPress={() => router.push('/live')} />
      )}
    </Card>
  );
}
