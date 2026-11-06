import { router, Stack } from 'expo-router';
import { Plus, Trophy } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState, Screen, Skeleton, useThemedRefreshControl } from '@/components';
import { CompetitionCard } from '@/features/competitions/CompetitionCard';
import { useCompetitions, type Competition, type CompetitionStatus } from '@/features/competitions';
import { useRounds } from '@/features/rounds';
import { useActiveSeason } from '@/features/seasons';
import { useThemeColors } from '@/theme';

const SECTIONS: { status: CompetitionStatus; title: string }[] = [
  { status: 'open', title: 'Open to join' },
  { status: 'live', title: 'In play' },
  { status: 'finished', title: 'Finished' },
];

/** All of this season's competitions, grouped by status, with a "+ New" header button. */
export default function CompetitionsScreen() {
  const c = useThemeColors();
  const season = useActiveSeason();
  const rounds = useRounds(season?.id ?? null);
  const { items, loading, refreshing, pullToRefresh } = useCompetitions(season?.id ?? null);
  const refresh = useThemedRefreshControl(refreshing, pullToRefresh);

  const grouped = SECTIONS.map((s) => ({
    ...s,
    items: (items ?? []).filter((x: Competition) => x.status === s.status),
  })).filter((s) => s.items.length > 0);

  return (
    <Screen glow="hype" edges={[]}>
      <Stack.Screen
        options={{
          title: 'Competitions',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/competitions/new')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="New competition"
              className="flex-row items-center gap-xs rounded-full border border-border bg-surface px-md py-xs active:opacity-80"
            >
              <Plus size={16} color={c.primary} strokeWidth={2.4} />
              <Text className="text-sm font-semibold" style={{ color: c.primary }}>
                New
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 24 }}
        refreshControl={refresh}
      >
        {loading || rounds === null ? (
          <View className="gap-md">
            <Skeleton height={110} radius={16} />
            <Skeleton height={110} radius={16} />
          </View>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No competitions yet"
            message="Start one — best XI over a matchday, or the best keeper pick through the knockouts — and put a reward on it."
            action={
              <Pressable
                onPress={() => router.push('/competitions/new')}
                className="rounded-full bg-primary px-lg py-sm active:opacity-80"
              >
                <Text className="text-sm font-bold text-bg">Create a competition</Text>
              </Pressable>
            }
          />
        ) : (
          grouped.map((section) => (
            <View key={section.status} className="gap-md">
              <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
                {section.title}
              </Text>
              {section.items.map((comp) => (
                <CompetitionCard
                  key={comp.id}
                  competition={comp}
                  rounds={rounds}
                  onPress={() => router.push(`/competitions/${comp.id}`)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
