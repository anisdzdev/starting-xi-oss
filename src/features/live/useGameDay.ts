import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

export type TeamLite = {
  id: number;
  name: string;
  code: string;
  flag_url: string | null;
};

export type Fixture = {
  id: number;
  fotmob_id: number;
  kickoff_utc: string;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  home_score: number | null;
  away_score: number | null;
  /** FotMob id of the Man of the Match (matches players.fotmob_id); null until set. */
  motm_player_id: number | null;
  home: TeamLite;
  away: TeamLite;
};

const FIXTURE_SELECT =
  'id, fotmob_id, kickoff_utc, status, home_score, away_score, motm_player_id, ' +
  'home:teams!fixtures_home_team_fkey(id, name, code, flag_url), ' +
  'away:teams!fixtures_away_team_fkey(id, name, code, flag_url)';

/**
 * Today's fixtures (game day = US-Eastern calendar date, same rule the backend
 * uses to write fixtures.game_day) with live score/status updates pushed over
 * Supabase Realtime.
 */
export function useGameDay(targetDay?: string | null) {
  // undefined → today (default); explicit string → that day; null → not ready.
  const gameDay = targetDay === undefined ? currentGameDay() : targetDay;
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);

  const refetch = useCallback(async () => {
    if (!gameDay) return; // not ready — leave fixtures null (loading)
    const { data, error } = await getSupabase()
      .from('fixtures')
      .select(FIXTURE_SELECT)
      .eq('game_day', gameDay)
      .order('kickoff_utc');
    if (!error) setFixtures((data as unknown as Fixture[]) ?? []);
  }, [gameDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    refetch();
  }, [refetch]);

  // Unique channel per hook instance — two mounted screens must not share a topic.
  const channelId = useRef(`fixtures-${Math.random().toString(36).slice(2)}`);

  // Realtime: fixtures rows are UPDATEd by poll-live during matches.
  useEffect(() => {
    if (!gameDay) return;
    const channel = getSupabase()
      .channel(`${channelId.current}-${gameDay}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `game_day=eq.${gameDay}` },
        (payload) => {
          const next = payload.new as Partial<Fixture> & { id: number };
          setFixtures(
            (prev) =>
              prev?.map((f) =>
                f.id === next.id
                  ? {
                      ...f,
                      status: (next.status as Fixture['status']) ?? f.status,
                      home_score: next.home_score ?? f.home_score,
                      away_score: next.away_score ?? f.away_score,
                      motm_player_id: next.motm_player_id ?? f.motm_player_id,
                    }
                  : f
              ) ?? prev
          );
        }
      )
      .subscribe();
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [gameDay]);

  const derived = useMemo(() => {
    const list = fixtures ?? [];
    const upcoming = list.filter((f) => f.status === 'scheduled');
    return {
      firstKickoff: upcoming.length > 0 ? new Date(upcoming[0].kickoff_utc) : null,
      liveCount: list.filter((f) => f.status === 'live').length,
    };
  }, [fixtures]);

  return {
    gameDay,
    fixtures,
    loading: fixtures === null,
    refetch,
    ...derived,
  };
}
