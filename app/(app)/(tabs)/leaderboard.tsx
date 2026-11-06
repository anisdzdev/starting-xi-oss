import { Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import {
  EmptyState,
  Screen,
  ScoringInfoButton,
  SkeletonRow,
  useThemedRefreshControl,
} from '@/components';
import { DayStrip } from '@/features/live/DayStrip';
import { BoardRowItem } from '@/features/leaderboard/BoardRowItem';
import {
  useLeaderboard,
  type BoardKey,
  type BoardRow,
} from '@/features/leaderboard/useLeaderboard';
import {
  RoundStrip,
  defaultRoundFor,
  roundOfDay,
  stepRound,
  useRounds,
} from '@/features/rounds';
import {
  SeasonPicker,
  defaultDayFor,
  useActiveSeason,
  useSeasonRetry,
  useSeasons,
  type Season,
} from '@/features/seasons';
import { currentGameDay } from '@/shared/gameday';
import { spacing } from '@/theme';

const SEGMENTS: { key: BoardKey; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'round', label: 'Matchday' },
  { key: 'overall', label: 'Overall' },
  { key: 'team', label: 'Team pick' },
  { key: 'player', label: 'Player pick' },
  { key: 'keeper', label: 'Keeper pick' },
];

const PICK_BOARDS: BoardKey[] = ['team', 'player', 'keeper'];

export default function LeaderboardScreen() {
  const today = currentGameDay();
  const seasons = useSeasons();
  const activeSeason = useActiveSeason();
  useSeasonRetry(); // a failed cold-start load must not leave Standings on a skeleton
  // Selected season: the active one by default; the switcher opens archived
  // seasons (World Cup) read-only. Null until the seasons store has loaded.
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    if (!season && activeSeason) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init once seasons load
      setSeason(activeSeason);
    }
  }, [season, activeSeason]);

  const [segment, setSegment] = useState<BoardKey>('daily');
  const [day, setDay] = useState(today);
  // "Today" for the selected season: today while it runs, its last day once archived.
  const seasonToday = season ? defaultDayFor(season, today) : today;

  // Rounds (matchdays / knockout stages) of the selected season. The selected
  // round is DERIVED: a chosen key if it exists in this season, else the round
  // containing the season's "today" — so a season switch needs no reset effect.
  const rounds = useRounds(season?.id ?? null);
  const [roundKey, setRoundKey] = useState<string | null>(null);
  const round = rounds
    ? (rounds.find((r) => r.key === roundKey) ?? defaultRoundFor(rounds, seasonToday))
    : null;
  const prevRound = rounds && round ? stepRound(rounds, round.key, 'older') : null;
  const dayRound = roundOfDay(rounds ?? [], day);
  // Rounds loaded but none exist (a season inserted before its seed, or a failed
  // load) → show the empty state rather than a skeleton that never resolves.
  const noRounds = segment === 'round' && rounds !== null && round === null;

  // Day selector only applies to the Daily board, the round selector to Matchday;
  // other boards always query "now".
  const { rows, loading, refreshing, pullToRefresh } = useLeaderboard(segment, season, {
    gameDay: segment === 'daily' ? day : undefined,
    roundKey: segment === 'round' ? (round?.key ?? null) : undefined,
    prevRoundKey: segment === 'round' ? (prevRound?.key ?? null) : undefined,
  });

  // Pick boards only exist for seasons that had tournament picks (the World Cup).
  const segments = SEGMENTS.filter(
    (s) => season?.hasTournamentPicks || !PICK_BOARDS.includes(s.key)
  );

  const selectSegment = (key: BoardKey) => {
    setSegment(key);
    // Reset to the season's current day whenever the Daily board is (re)opened.
    if (key === 'daily') setDay(seasonToday);
  };

  const selectSeason = (s: Season) => {
    setSeason(s);
    setDay(defaultDayFor(s, today));
    if (!s.hasTournamentPicks && PICK_BOARDS.includes(segment)) setSegment('daily');
  };

  return (
    <Screen glow="hype" edges={['top']}>
      <View className="gap-md px-xl pb-md pt-xl">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-text">Standings</Text>
          <View className="flex-row items-center gap-sm">
            {season && seasons.length > 0 ? (
              <SeasonPicker value={season} seasons={seasons} onChange={selectSeason} />
            ) : null}
            <ScoringInfoButton />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Break out of the screen's 24px horizontal padding so the segment
          // pills run edge-to-edge; restore the 24px inset inside the content so
          // the first pill still aligns with the "Standings" header.
          style={{ marginHorizontal: -spacing.xl }}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
        >
          {segments.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => selectSegment(s.key)}
              className={`rounded-full border px-md py-xs ${
                segment === s.key ? 'border-primary bg-primary/15' : 'border-border bg-surface'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  segment === s.key ? 'text-primary' : 'text-textMuted'
                }`}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {segment === 'daily' && season ? (
        <DayStrip
          selected={day}
          onSelect={setDay}
          from={season.startsOn}
          to={season.endsOn < today ? season.endsOn : today}
          subtitle={dayRound?.label ?? null}
        />
      ) : null}
      {segment === 'round' && rounds && round ? (
        <RoundStrip rounds={rounds} selected={round} onSelect={(r) => setRoundKey(r.key)} />
      ) : null}

      {loading && !noRounds ? (
        <View className="gap-lg px-xl pt-md">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <BoardList
          rows={noRounds ? [] : (rows ?? [])}
          refreshing={refreshing}
          onRefresh={pullToRefresh}
          // Past Daily days link to that day's roster (revealed even while today
          // is still hidden); other boards / today link to the live team view.
          rowGameDay={segment === 'daily' && day !== today ? day : undefined}
          emptyMessage={
            segment === 'daily'
              ? day === today
                ? rounds !== null && !dayRound
                  ? 'Rest day — no matches today.'
                  : 'Points appear once today’s matches kick off.'
                : 'No entries for this day.'
              : segment === 'round'
                ? noRounds
                  ? 'No rounds yet — fixtures haven’t been loaded for this season.'
                  : 'No points in this round yet.'
                : season?.status === 'archived'
                  ? 'Nobody scored on this board.'
                  : 'No entries on this board yet.'
          }
        />
      )}
    </Screen>
  );
}

/**
 * Animated list on native (staggered reveal + springy rank-change reordering);
 * plain FlatList on web — reanimated layout/entering animations inside list
 * cells render blank on react-native-web.
 */
function BoardList({
  rows,
  refreshing,
  onRefresh,
  emptyMessage,
  rowGameDay,
}: {
  rows: BoardRow[];
  refreshing: boolean;
  onRefresh: () => void;
  emptyMessage: string;
  rowGameDay?: string;
}) {
  const empty = (
    <EmptyState icon={Trophy} title="Nothing here yet" message={emptyMessage} />
  );
  const container = { paddingHorizontal: 24, paddingTop: spacing.lg, paddingBottom: 24 };
  const refresh = useThemedRefreshControl(refreshing, onRefresh);

  if (Platform.OS === 'web') {
    // Plain scroll render on web. NO refreshControl here: react-native-web's
    // ScrollView nests content inside it and the web RefreshControl stub
    // renders null — swallowing every child. Pull-to-refresh is native-only.
    return (
      <ScrollView contentContainerStyle={container}>
        {rows.length === 0
          ? empty
          : rows.map((r) => <BoardRowItem key={r.userId} row={r} gameDay={rowGameDay} />)}
      </ScrollView>
    );
  }
  return (
    <Animated.FlatList
      data={rows}
      keyExtractor={(r) => r.userId}
      itemLayoutAnimation={LinearTransition.springify().damping(18)}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 45)}>
          <BoardRowItem row={item} gameDay={rowGameDay} />
        </Animated.View>
      )}
      contentContainerStyle={container}
      refreshControl={refresh}
      ListEmptyComponent={empty}
    />
  );
}
