import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, FlagBadge } from '@/components';

import { MatchSheet } from './MatchSheet';
import type { Fixture, TeamLite } from './useGameDay';

/**
 * Approximate live minute from kickoff (the DB doesn't store match minute).
 * Ignores halftime/stoppage subtleties — good enough for a glanceable rail.
 */
function approxMinute(kickoffUtc: string): string {
  const elapsed = Math.floor((Date.now() - new Date(kickoffUtc).getTime()) / 60_000) + 1;
  return `${Math.min(Math.max(elapsed, 1), 120)}'`;
}

/**
 * Tick the approximated minute forward on its own clock. Without this the card
 * only re-renders on a realtime score event, so the minute freezes at the value
 * it had when the last goal landed — looking stuck minutes behind the real game.
 */
function useApproxMinute(kickoffUtc: string, live: boolean): string {
  const [minute, setMinute] = useState(() => approxMinute(kickoffUtc));
  useEffect(() => {
    if (!live) return;
    setMinute(approxMinute(kickoffUtc));
    const id = setInterval(() => setMinute(approxMinute(kickoffUtc)), 20_000);
    return () => clearInterval(id);
  }, [kickoffUtc, live]);
  return minute;
}

function localKickoffTime(kickoffUtc: string): string {
  return new Date(kickoffUtc).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function TeamRow({
  team,
  score,
  live,
  showScore,
}: {
  team: TeamLite;
  score: number | null;
  live: boolean;
  showScore: boolean;
}) {
  return (
    <View className="flex-row items-center gap-sm">
      <FlagBadge uri={team.flag_url} code={team.code} size={26} live={live} />
      <Text className="w-[44px] text-sm font-semibold text-text">{team.code}</Text>
      {/* FotMob pre-populates 0s before kickoff — only meaningful once started */}
      {showScore && score !== null ? (
        <Text className="text-sm font-bold text-text">{score}</Text>
      ) : null}
    </View>
  );
}

export function FixtureCard({ fixture, gameDay }: { fixture: Fixture; gameDay: string }) {
  const isLive = fixture.status === 'live';
  const isDone = fixture.status === 'finished';
  const minute = useApproxMinute(fixture.kickoff_utc, isLive);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="active:opacity-80">
        <Card variant="glass" className="w-[150px] gap-sm">
          <View className="flex-row items-center justify-between">
            {isLive ? (
              <View className="flex-row items-center gap-xs">
                <View className="h-[7px] w-[7px] rounded-full bg-live" />
                <Text className="text-xs font-bold text-live">{minute}</Text>
              </View>
            ) : (
              <Text className="text-xs font-medium text-textMuted">
                {isDone ? 'FT' : localKickoffTime(fixture.kickoff_utc)}
              </Text>
            )}
            {fixture.status === 'postponed' || fixture.status === 'cancelled' ? (
              <Text className="text-xs font-medium uppercase text-warning">{fixture.status}</Text>
            ) : null}
          </View>
          <TeamRow
            team={fixture.home}
            score={fixture.home_score}
            live={isLive}
            showScore={isLive || isDone}
          />
          <TeamRow
            team={fixture.away}
            score={fixture.away_score}
            live={isLive}
            showScore={isLive || isDone}
          />
        </Card>
      </Pressable>
      {open ? (
        <MatchSheet
          fixture={fixture}
          gameDay={gameDay}
          visible={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
