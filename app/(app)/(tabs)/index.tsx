import { format, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { CalendarOff, ChevronRight, Swords, Trophy } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { ScrollView } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  CountdownTimer,
  EmptyState,
  InstallPrompt,
  PulsingDot,
  Screen,
  Skeleton,
  WebPushToggle,
} from '@/components';
import { useSession } from '@/features/auth/session-context';
import { FixtureCard } from '@/features/live/FixtureCard';
import { useGameDay } from '@/features/live/useGameDay';
import { useActiveGameDay } from '@/features/live/useActiveGameDay';
import { useTournamentPicks } from '@/features/picks/useTournamentPicks';
import { useNextGameDayPreview } from '@/features/live/useNextGameDayPreview';
import { roundOfDay, useRounds } from '@/features/rounds';
import { useActiveSeason } from '@/features/seasons';
import { useMyRoster } from '@/features/roster/useMyRoster';
import { XIStatusCard } from '@/features/roster/XIStatusCard';
import { currentGameDay } from '@/shared/gameday';
import { spacing, useThemeColors } from '@/theme';

export default function HomeScreen() {
  const c = useThemeColors();
  const { gameDay, fixtures, loading, liveCount } = useGameDay();
  const active = useActiveGameDay();
  const roster = useMyRoster(active.buildDay);
  // Label the build day on the XI card only when it isn't today.
  const buildDayLabel =
    active.buildDay !== gameDay ? format(parseISO(active.buildDay), 'EEE, MMM d') : undefined;
  const { profile, signOut } = useSession();
  // Tournament picks only exist for seasons that have them (the World Cup) —
  // the Champions League season shows no picks row and never redirects.
  const season = useActiveSeason();
  const picksEnabled = !!season?.hasTournamentPicks;
  // Eyebrow: "UCL 26/27 · Matchday 3" for the build day when known, else "Game day".
  const rounds = useRounds(season?.id ?? null);
  const buildRound = roundOfDay(rounds ?? [], active.buildDay);
  const eyebrow = season && buildRound ? `${season.shortName} · ${buildRound.label}` : 'Game day';
  const tournamentPicks = useTournamentPicks(picksEnabled ? season!.id : null);

  // Blocking onboarding: tournament picks come first while they're still open.
  useEffect(() => {
    if (
      picksEnabled &&
      !tournamentPicks.loading &&
      !tournamentPicks.hasPicks &&
      !tournamentPicks.locked
    ) {
      router.replace('/picks');
    }
  }, [picksEnabled, tournamentPicks.loading, tournamentPicks.hasPicks, tournamentPicks.locked]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const hasFixtures = (fixtures?.length ?? 0) > 0; // today's rail

  // The XI locks at the build day's FIRST kickoff (min over ALL fixtures, any
  // status) — NOT when the last scheduled match remains. Once that's passed the
  // day has started: the XI is locked and the countdown is just the wait until
  // the next match. Guard on !resolving so the initial resolve window (buildDay
  // null, fixtures empty) never reads as "started".
  const lockTime = useMemo(() => {
    const times = (active.fixtures ?? []).map((f) => new Date(f.kickoff_utc).getTime());
    return times.length > 0 ? Math.min(...times) : null;
  }, [active.fixtures]);
  const locked = !active.resolving && lockTime !== null && Date.now() >= lockTime;
  const dayStarted = locked;
  const countdownLabel = buildDayLabel
    ? `${buildDayLabel} — your XI locks in` // future build day — never locked yet
    : locked
      ? 'Next match in'
      : 'First kickoff — your XI locks in';

  return (
    <Screen glow={liveCount > 0 ? 'live' : 'hype'} edges={['top']} parallax={scrollY}>
      {/* Animated.ScrollView: className not processed on reanimated — explicit container style */}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: 24, paddingHorizontal: 24, paddingVertical: 24 }}
      >
        <Animated.View entering={FadeInDown.duration(350)}>
        <View className="flex-row items-center justify-between">
          <View className="gap-xs">
            <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
              {eyebrow}
            </Text>
            <Text className="text-2xl font-bold text-text">
              {gameDay ? format(parseISO(gameDay), 'EEEE, MMMM d') : ''}
            </Text>
          </View>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={40} />
        </View>
        </Animated.View>

        {active.firstKickoff ? (
          <Animated.View entering={FadeInDown.duration(350).delay(60)}>
          <Card variant="glass">
            <View className="items-center gap-md">
              <Text className="text-sm text-textMuted">{countdownLabel}</Text>
              <CountdownTimer target={active.firstKickoff} onComplete={active.refetch} />
            </View>
          </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(350).delay(120)}>
        <View className="gap-md">
          <View className="flex-row items-center gap-sm">
            <Text className="text-sm font-semibold uppercase tracking-widest text-textFaint">
              {liveCount > 0 ? 'Matches · Live now' : 'Matches'}
            </Text>
            {liveCount > 0 ? <PulsingDot size={7} /> : null}
          </View>
          {loading ? (
            <View className="flex-row gap-md">
              <Skeleton width={150} height={120} radius={20} />
              <Skeleton width={150} height={120} radius={20} />
            </View>
          ) : hasFixtures ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // Break out of the screen's 24px horizontal padding so the rail
              // runs edge-to-edge; restore the 24px inset inside the content so
              // the first card still aligns with the rest of the screen.
              style={{ marginHorizontal: -spacing.xl }}
              contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.xl }}
            >
              {fixtures!.map((f) => (
                <FixtureCard key={f.id} fixture={f} gameDay={gameDay!} />
              ))}
            </ScrollView>
          ) : (
            <RestDayCard />
          )}
        </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(350).delay(180)}>
        <XIStatusCard
          roster={roster}
          dayStarted={dayStarted}
          hasLive={active.liveCount > 0}
          buildDayLabel={buildDayLabel}
        />
        </Animated.View>

        <Pressable
          onPress={() => router.push('/competitions')}
          className="flex-row items-center gap-md rounded-xl border border-border bg-surface px-lg py-md active:opacity-80"
        >
          <Swords size={18} color={c.captain} strokeWidth={2.2} />
          <Text className="flex-1 text-base font-semibold text-text">Competitions</Text>
          <ChevronRight size={18} color={c.textFaint} strokeWidth={2.2} />
        </Pressable>

        {picksEnabled ? (
          <Pressable
            onPress={() => router.push('/picks')}
            className="flex-row items-center gap-md rounded-xl border border-border bg-surface px-lg py-md active:opacity-80"
          >
            <Trophy size={18} color={c.captain} strokeWidth={2.2} />
            <Text className="flex-1 text-base font-semibold text-text">Tournament picks</Text>
            <ChevronRight size={18} color={c.textFaint} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <WebPushToggle />
        <InstallPrompt />

        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Animated.ScrollView>
    </Screen>
  );
}

/** Rest day: the next game day's fixtures as a preview rail (may be days away). */
function RestDayCard() {
  const { fixtures: next, gameDay: nextDay } = useNextGameDayPreview();
  const label =
    nextDay === currentGameDay(1)
      ? 'Tomorrow'
      : nextDay
        ? format(parseISO(nextDay), 'EEE, MMM d')
        : '';
  return (
    <Card variant="glass" className="gap-md">
      <EmptyState
        icon={CalendarOff}
        title="No matches today"
        message="Rest day. Scout the next matchday and plan your XI."
      />
      {next && next.length > 0 && nextDay ? (
        <View className="gap-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
            {label}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-md"
          >
            {next.map((f) => (
              <FixtureCard key={f.id} fixture={f} gameDay={nextDay} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </Card>
  );
}
