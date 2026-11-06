import { router } from 'expo-router';
import { Radio, Trophy } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';

import { Button, Card, EmptyState, PulsingDot, Screen, ScoringInfoButton, Skeleton } from '@/components';
import { CaptainBurst } from '@/features/live/CaptainBurst';
import { useStaleLiveData } from '@/features/live/useStaleLiveData';
import { LiveSlot } from '@/features/live/LiveSlot';
import { PointsBreakdownSheet } from '@/features/live/PointsBreakdownSheet';
import { useCountUpTotal } from '@/features/live/useCountUpTotal';
import type { Fixture } from '@/features/live/useGameDay';
import {
  useLiveRoster,
  type DbStats,
  type LiveRosterPlayer,
} from '@/features/live/useLiveRoster';
import { CoachBadge } from '@/features/roster/CoachBadge';
import { useCoachPick } from '@/features/roster/useCoachPick';
import { layoutFromPositions } from '@/features/roster/formations';
import { Pitch } from '@/features/roster/Pitch';
import { captainHaptic, scoreHaptic } from '@/lib/haptics';
import { currentGameDay } from '@/shared/gameday';
import { useThemeColors } from '@/theme';

type Props = {
  /** Whose XI to show (defaults to the signed-in user). */
  userId?: string;
  /** Which game day to show (defaults to today). */
  gameDay?: string;
  /**
   * Whether building an XI is still possible for this day. When false (e.g. a
   * past game day), the "no XI" state omits the Build button — building only
   * ever targets the current build day, so a past-day CTA would be misleading.
   */
  buildable?: boolean;
};

export function LiveRosterView({ userId, gameDay, buildable = true }: Props) {
  const c = useThemeColors();
  const { roster, statsByPlayer, changedAt, events, board, fixtureByTeam, loading } =
    useLiveRoster(userId, gameDay);
  const [selected, setSelected] = useState<LiveRosterPlayer | null>(null);

  // Coach of the Day folds into the headline total (and the daily_leaderboard rank
  // already includes it), so the top-left total must add the coach's points too.
  const coach = useCoachPick(gameDay ?? currentGameDay(), userId);
  const coachPoints = coach.points ?? 0;

  const xiTotal = useMemo(() => {
    if (!Array.isArray(roster)) return 0;
    return roster.reduce((sum, p) => {
      const pts = statsByPlayer.get(p.id)?.fpl_points ?? 0;
      return sum + (p.isCaptain ? pts * 2 : pts);
    }, 0);
  }, [roster, statsByPlayer]);
  const teamTotal = xiTotal + coachPoints;
  const displayTotal = useCountUpTotal(teamTotal);

  const anyLive = useMemo(() => {
    if (!Array.isArray(roster)) return false;
    return roster.some((p) => fixtureByTeam.get(p.teamId)?.status === 'live');
  }, [roster, fixtureByTeam]);

  // Haptics on score changes + confetti when the CAPTAIN's points rise.
  const prevTotal = useRef<number | null>(null);
  const captain = Array.isArray(roster) ? roster.find((p) => p.isCaptain) : undefined;
  const captainPts = captain ? (statsByPlayer.get(captain.id)?.fpl_points ?? 0) : 0;
  const prevCaptainPts = useRef<number | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (prevTotal.current !== null && teamTotal > prevTotal.current) scoreHaptic();
    prevTotal.current = teamTotal;
  }, [teamTotal]);

  useEffect(() => {
    if (prevCaptainPts.current !== null && captainPts > prevCaptainPts.current) {
      captainHaptic();
      setBurstKey((k) => k + 1); // remount → replay confetti
    }
    prevCaptainPts.current = captainPts;
  }, [captainPts]);

  if (loading) {
    return (
      <Screen glow="live" edges={['bottom']}>
        <View className="gap-md px-xl py-xl">
          <Skeleton width="100%" height={88} radius={20} />
          <Skeleton width="100%" height={440} radius={20} />
        </View>
      </Screen>
    );
  }

  if (roster === 'none' || !Array.isArray(roster)) {
    return (
      <Screen glow="live" edges={['bottom']}>
        <EmptyState
          icon={Radio}
          title={buildable ? 'No XI today' : 'No XI this day'}
          message={
            buildable
              ? "You haven't locked in a team yet."
              : "You didn't pick a team for this game day."
          }
          action={
            buildable ? (
              <Button title="Build your XI" onPress={() => router.replace('/roster')} />
            ) : undefined
          }
        />
      </Screen>
    );
  }

  // formation shape from the saved slots' positions
  const layout = derivedLayout(roster);

  return (
    <Screen glow={anyLive ? 'live' : 'pitch'} edges={['bottom']}>
      {/* top bar: total + rank (left) · scoring info + coach (right) */}
      <Animated.View entering={FadeInDown.duration(300)}>
      <View className="flex-row items-center justify-between gap-sm px-xl py-md">
        <View className="flex-row items-center gap-md" style={{ flexShrink: 0 }}>
          <View className="flex-row items-end gap-sm">
            <Text className="text-display font-bold text-text">{displayTotal}</Text>
            <Text className="pb-sm text-sm text-textMuted">pts</Text>
            {anyLive ? (
              <View className="mb-md">
                <PulsingDot size={8} />
              </View>
            ) : null}
          </View>
          <Card variant="glass" className="flex-row items-center gap-xs px-md py-sm">
            <Trophy size={16} color={c.captain} strokeWidth={2.2} />
            <Text className="text-base font-bold text-text">
              {board ? `#${board.rank}` : '—'}
            </Text>
          </Card>
        </View>
        <View className="flex-row items-center gap-sm" style={{ flexShrink: 1 }}>
          <ScoringInfoButton />
          <CoachBadge pick={coach.pick} points={coach.points} breakdown={coach.breakdown} />
        </View>
      </View>
      </Animated.View>

      <StaleBanner anyLive={anyLive} />

      {/* ticker */}
      {events.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-sm max-h-[30px]"
          contentContainerClassName="gap-sm px-xl items-center"
        >
          {events.map((e) => (
            <Animated.View
              key={e.id}
              entering={FadeInLeft.duration(250)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text className="text-xs font-semibold text-textMuted">{e.text}</Text>
            </Animated.View>
          ))}
        </ScrollView>
      ) : null}

      <PitchWithSlots
        roster={roster}
        layout={layout}
        statsByPlayer={statsByPlayer}
        changedAt={changedAt}
        fixtureByTeam={fixtureByTeam}
        onSelect={setSelected}
        burstKey={burstKey}
        captainSlotIndex={captain ? roster.indexOf(captain) : -1}
      />

      <PointsBreakdownSheet
        player={selected}
        stats={selected ? (statsByPlayer.get(selected.id) ?? null) : null}
        matchFinished={
          selected ? fixtureByTeam.get(selected.teamId)?.status === 'finished' : false
        }
        onClose={() => setSelected(null)}
      />
    </Screen>
  );
}

/** Shown only while matches are live and the poller has gone quiet/failing. */
function StaleBanner({ anyLive }: { anyLive: boolean }) {
  const c = useThemeColors();
  const stale = useStaleLiveData(anyLive);
  if (!stale) return null;
  return (
    <View
      className="mx-xl mb-sm flex-row items-center gap-sm rounded-lg border px-md py-sm"
      style={{ borderColor: `${c.warning}55`, backgroundColor: `${c.warning}14` }}
    >
      <Text className="flex-1 text-xs font-medium" style={{ color: c.warning }}>
        Live data delayed — last update{' '}
        {stale.lastAt
          ? new Date(stale.lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'unknown'}
        . Scores will catch up automatically.
      </Text>
    </View>
  );
}

/** Slot coordinates from the saved XI's positions (works even for partial rosters). */
function derivedLayout(roster: LiveRosterPlayer[]) {
  return layoutFromPositions(roster.map((p) => p.position));
}

function PitchWithSlots({
  roster,
  layout,
  statsByPlayer,
  changedAt,
  fixtureByTeam,
  onSelect,
  burstKey,
  captainSlotIndex,
}: {
  roster: LiveRosterPlayer[];
  layout: ReturnType<typeof layoutFromPositions>;
  statsByPlayer: Map<number, DbStats>;
  changedAt: Map<number, number>;
  fixtureByTeam: Map<number, Fixture>;
  onSelect: (p: LiveRosterPlayer) => void;
  burstKey: number;
  captainSlotIndex: number;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const captainPoint = captainSlotIndex >= 0 ? layout[captainSlotIndex] : null;
  return (
    <Pitch
      style={{ flex: 1, marginHorizontal: 12, marginBottom: 12 }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {roster.map((p, i) => {
        const point = layout[i];
        if (!point) return null;
        const stats = statsByPlayer.get(p.id) ?? null;
        const fixture = fixtureByTeam.get(p.teamId) ?? null;
        const base = stats?.fpl_points ?? null;
        const isMotm =
          fixture?.motm_player_id != null &&
          p.fotmobId != null &&
          fixture.motm_player_id === p.fotmobId;
        return (
          <LiveSlot
            key={p.id}
            player={p}
            points={base === null ? null : p.isCaptain ? base * 2 : base}
            stats={stats}
            isMotm={isMotm}
            matchStatus={fixture?.status ?? 'scheduled'}
            kickoffUtc={fixture?.kickoff_utc ?? null}
            flashKey={changedAt.get(p.id)}
            x={point.x}
            y={point.y}
            onPress={() => onSelect(p)}
          />
        );
      })}
      {burstKey > 0 && captainPoint && size ? (
        <CaptainBurst
          key={burstKey}
          x={(captainPoint.x / 100) * size.w}
          y={(captainPoint.y / 100) * size.h + 12}
        />
      ) : null}
    </Pitch>
  );
}
