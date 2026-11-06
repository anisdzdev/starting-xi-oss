import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

import { useGameDay } from '../live/useGameDay';
import { useActiveSeason } from '../seasons';

export type MemberStatus = 'none' | 'building' | 'locked';

export type TournamentPicks = {
  teamCode: string | null;
  teamFlag: string | null;
  playerName: string | null;
  playerImage: string | null;
  keeperName: string | null;
  keeperImage: string | null;
};

export type LeagueMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: MemberStatus;
  pickedCount: number;
  /** Today's points (captain ×2 included) — only meaningful once locked. */
  points: number | null;
  hasException: boolean;
  picks: TournamentPicks | null;
};

/**
 * Everyone in the league with today's XI status, live points and tournament
 * picks. Lock = first kickoff of the day (same rule as the roster builder).
 */
export function useLeagueMembers() {
  const { gameDay, fixtures } = useGameDay();
  // Tournament picks are per season and only exist where the season has them.
  const season = useActiveSeason();
  const picksSeasonId = season?.hasTournamentPicks ? season.id : null;
  const [members, setMembers] = useState<LeagueMember[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const lockTime = useMemo(() => {
    const times = (fixtures ?? []).map((f) => new Date(f.kickoff_utc).getTime());
    return times.length > 0 ? Math.min(...times) : null;
  }, [fixtures]);
  const locked = lockTime !== null && Date.now() >= lockTime;

  const fetchMembers = useCallback(async () => {
    const supabase = getSupabase();
    const [{ data: profiles }, { data: rosters }, { data: board }, { data: picks }, { data: exceptions }] =
      await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_url').order('display_name'),
        supabase
          .from('rosters')
          .select('user_id, locked_at, roster_players(count)')
          .eq('game_day', gameDay),
        supabase.from('daily_leaderboard').select('user_id, points').eq('game_day', gameDay),
        picksSeasonId
          ? supabase
              .from('tournament_picks')
              .select(
                'user_id, team:teams(code, flag_url), ' +
                  'player:players!tournament_picks_player_id_fkey(name, image_url), ' +
                  'keeper:players!tournament_picks_keeper_id_fkey(name, image_url)'
              )
              .eq('season_id', picksSeasonId)
          : Promise.resolve({ data: [] }),
        supabase.from('roster_exceptions').select('user_id').eq('game_day', gameDay),
      ]);

    const rosterBy = new Map(
      (rosters ?? []).map((r) => [
        r.user_id as string,
        {
          lockedAt: r.locked_at as string | null,
          count: (r.roster_players as { count: number }[] | null)?.[0]?.count ?? 0,
        },
      ])
    );
    const pointsBy = new Map((board ?? []).map((b) => [b.user_id as string, b.points as number]));
    const picksBy = new Map(
      ((picks ?? []) as unknown as {
        user_id: string;
        team: { code: string; flag_url: string | null } | null;
        player: { name: string; image_url: string | null } | null;
        keeper: { name: string; image_url: string | null } | null;
      }[]).map((p) => [
        p.user_id,
        {
          teamCode: p.team?.code ?? null,
          teamFlag: p.team?.flag_url ?? null,
          playerName: p.player?.name ?? null,
          playerImage: p.player?.image_url ?? null,
          keeperName: p.keeper?.name ?? null,
          keeperImage: p.keeper?.image_url ?? null,
        },
      ])
    );

    const exceptionBy = new Set((exceptions ?? []).map((e) => e.user_id as string));

    setMembers(
      (profiles ?? []).map((p) => {
        const roster = rosterBy.get(p.id);
        const status: MemberStatus = !roster ? 'none' : locked ? 'locked' : 'building';
        return {
          id: p.id,
          name: p.display_name,
          avatarUrl: p.avatar_url,
          status,
          pickedCount: roster?.count ?? 0,
          points: status === 'locked' ? (pointsBy.get(p.id) ?? 0) : null,
          hasException: exceptionBy.has(p.id),
          picks: picksBy.get(p.id) ?? null,
        };
      })
    );
  }, [gameDay, locked, picksSeasonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    fetchMembers();
  }, [fetchMembers]);

  // live points: stats changes → debounced refetch (only matters once locked)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = getSupabase()
      .channel(`league-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_match_stats' },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(fetchMembers, 1500);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(channel);
    };
  }, [fetchMembers]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMembers();
    setRefreshing(false);
  }, [fetchMembers]);

  return {
    members,
    loading: members === null,
    locked,
    lockTime,
    refreshing,
    pullToRefresh,
    refetch: fetchMembers,
  };
}
