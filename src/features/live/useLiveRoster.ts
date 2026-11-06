import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';
import { POINTS, type Position } from '@/shared/scoring';

import { useGameDay, type Fixture } from './useGameDay';

export type DbStats = {
  player_id: number;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheet: boolean;
  saves: number;
  pen_saves: number;
  pen_misses: number;
  yellows: number;
  reds: number;
  own_goals: number;
  goals_conceded: number;
  rating: number | null;
  bonus: number;
  fpl_points: number;
};

export type LiveRosterPlayer = {
  slot: number;
  id: number;
  fotmobId: number | null;
  name: string;
  position: Position;
  imageUrl: string | null;
  teamId: number;
  teamCode: string;
  flagUrl: string | null;
  isCaptain: boolean;
};

export type TickerEvent = { id: number; text: string };

const STAT_FIELDS =
  'player_id, fixture_id, minutes, goals, assists, clean_sheet, saves, pen_saves, ' +
  'pen_misses, yellows, reds, own_goals, goals_conceded, rating, bonus, fpl_points';

/** Human line for what changed between two stat rows (ticker copy). */
function describeDelta(
  name: string,
  position: Position,
  prev: DbStats | undefined,
  next: DbStats
): string[] {
  const last = name.split(' ').slice(-1)[0];
  const out: string[] = [];
  const d = (k: keyof DbStats) => Number(next[k] ?? 0) - Number(prev?.[k] ?? 0);

  if (d('goals') > 0) out.push(`${last} +${d('goals') * POINTS.goal[position]} Goal`);
  if (d('assists') > 0) out.push(`${last} +${d('assists') * POINTS.assist} Assist`);
  if (d('pen_saves') > 0) out.push(`${last} +${POINTS.penSave} Pen save`);
  if (d('pen_misses') > 0) out.push(`${last} ${POINTS.penMiss} Pen miss`);
  if (d('yellows') > 0) out.push(`${last} ${POINTS.yellow} Yellow`);
  if (d('reds') > 0) out.push(`${last} ${POINTS.red} Red card`);
  if (d('own_goals') > 0) out.push(`${last} ${POINTS.ownGoal} Own goal`);
  if (!prev?.clean_sheet && next.clean_sheet && next.minutes >= 60) {
    out.push(`${last} +${POINTS.cleanSheet[position]} Clean sheet`);
  }
  if (d('bonus') > 0) out.push(`${last} +${d('bonus')} Bonus`);
  if ((prev?.minutes ?? 0) === 0 && next.minutes > 0) out.push(`${last} +1 On the pitch`);

  if (out.length === 0) {
    const dp = d('fpl_points');
    if (dp !== 0) out.push(`${last} ${dp > 0 ? '+' : ''}${dp}`);
  }
  return out.slice(0, 2);
}

/**
 * The user's locked XI with live stats: initial fetch + Supabase Realtime on
 * player_match_stats (filtered to today's fixtures), delta ticker events, and
 * per-player change timestamps to drive highlight flashes.
 */
export function useLiveRoster(targetUserId?: string, targetGameDay?: string) {
  const { session } = useSession();
  const { gameDay, fixtures } = useGameDay(targetGameDay);
  const userId = targetUserId ?? session?.user.id ?? null;

  const [roster, setRoster] = useState<LiveRosterPlayer[] | null | 'none'>(null);
  const [statsByPlayer, setStatsByPlayer] = useState<Map<number, DbStats>>(new Map());
  const [changedAt, setChangedAt] = useState<Map<number, number>>(new Map());
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [board, setBoard] = useState<{ points: number; rank: number } | null>(null);
  const eventSeq = useRef(0);
  const rosterRef = useRef<LiveRosterPlayer[] | null>(null);

  // ---- roster ----
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from('rosters')
        .select(
          'captain_player_id, roster_players(slot_position, ' +
            'player:players(id, fotmob_id, name, position, image_url, team_id, team:teams(code, flag_url)))'
        )
        .eq('user_id', userId)
        .eq('game_day', gameDay)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setRoster('none');
        return;
      }
      const raw = data as unknown as {
        captain_player_id: number | null;
        roster_players: {
          slot_position: number;
          player: {
            id: number;
            fotmob_id: number | null;
            name: string;
            position: Position;
            image_url: string | null;
            team_id: number;
            team: { code: string; flag_url: string | null };
          };
        }[];
      };
      const players = raw.roster_players
        .map((rp) => ({
          slot: rp.slot_position,
          id: rp.player.id,
          fotmobId: rp.player.fotmob_id,
          name: rp.player.name,
          position: rp.player.position,
          imageUrl: rp.player.image_url,
          teamId: rp.player.team_id,
          teamCode: rp.player.team.code,
          flagUrl: rp.player.team.flag_url,
          isCaptain: rp.player.id === raw.captain_player_id,
        }))
        .sort((a, b) => a.slot - b.slot);
      rosterRef.current = players;
      setRoster(players);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, gameDay]);

  const fixtureIds = useMemo(() => (fixtures ?? []).map((f) => f.id), [fixtures]);
  const fixtureKey = fixtureIds.join(',');

  // ---- leaderboard (points + rank) ----
  const refreshBoard = useCallback(async () => {
    if (!userId) return;
    const { data } = await getSupabase()
      .from('daily_leaderboard')
      .select('points, rank')
      .eq('user_id', userId)
      .eq('game_day', gameDay)
      .maybeSingle();
    setBoard((data as { points: number; rank: number } | null) ?? null);
  }, [userId, gameDay]);

  // ---- initial stats + realtime ----
  useEffect(() => {
    if (fixtureIds.length === 0) return;
    let cancelled = false;
    let boardTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const { data } = await getSupabase()
        .from('player_match_stats')
        .select(STAT_FIELDS)
        .in('fixture_id', fixtureIds);
      if (cancelled) return;
      const map = new Map<number, DbStats>();
      for (const row of (data ?? []) as unknown as DbStats[]) map.set(row.player_id, row);
      setStatsByPlayer(map);
      refreshBoard();
    })();

    const channel = getSupabase()
      .channel(`live-stats-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_match_stats',
          filter: `fixture_id=in.(${fixtureIds.join(',')})`,
        },
        (payload) => {
          const next = payload.new as DbStats;
          if (!next?.player_id) return;
          setStatsByPlayer((prev) => {
            const old = prev.get(next.player_id);
            // ticker + flash only for players in MY roster
            const mine = rosterRef.current?.find((p) => p.id === next.player_id);
            if (mine && old?.fpl_points !== next.fpl_points) {
              const lines = describeDelta(mine.name, mine.position, old, next);
              if (lines.length > 0) {
                setEvents((ev) =>
                  [...lines.map((text) => ({ id: ++eventSeq.current, text })), ...ev].slice(0, 12)
                );
              }
              setChangedAt((m) => new Map(m).set(next.player_id, Date.now()));
            }
            return new Map(prev).set(next.player_id, next);
          });
          // debounce leaderboard refresh while updates stream in
          if (boardTimer) clearTimeout(boardTimer);
          boardTimer = setTimeout(refreshBoard, 1200);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (boardTimer) clearTimeout(boardTimer);
      getSupabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixtureKey stands in for fixtureIds
  }, [fixtureKey, refreshBoard]);

  // team id → fixture for status/kickoff per player
  const fixtureByTeam = useMemo(() => {
    const map = new Map<number, Fixture>();
    for (const f of fixtures ?? []) {
      map.set(f.home.id, f);
      map.set(f.away.id, f);
    }
    return map;
  }, [fixtures]);

  return {
    gameDay,
    roster,
    statsByPlayer,
    changedAt,
    events,
    board,
    fixtureByTeam,
    loading: roster === null || fixtures === null,
  };
}
