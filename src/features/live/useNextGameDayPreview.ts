import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

import type { Fixture } from './useGameDay';

const FIXTURE_SELECT =
  'id, fotmob_id, kickoff_utc, status, home_score, away_score, motm_player_id, ' +
  'home:teams!fixtures_home_team_fkey(id, name, code, flag_url), ' +
  'away:teams!fixtures_away_team_fkey(id, name, code, flag_url)';

/**
 * The NEXT game day with fixtures after today (rest-day preview rail). Not
 * literally tomorrow: a club season plays twice a week, so the next slate may
 * be days away. One-shot, no realtime. `gameDay` is null until resolved and
 * stays null when nothing is scheduled ahead.
 */
export function useNextGameDayPreview(): { fixtures: Fixture[] | null; gameDay: string | null } {
  const today = currentGameDay();
  const [state, setState] = useState<{ fixtures: Fixture[] | null; gameDay: string | null }>({
    fixtures: null,
    gameDay: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const { data: next } = await supabase
        .from('fixtures')
        .select('game_day')
        .gt('game_day', today)
        .order('game_day')
        .limit(1)
        .maybeSingle();
      const gameDay = (next as { game_day: string } | null)?.game_day ?? null;
      if (!gameDay) {
        if (!cancelled) setState({ fixtures: [], gameDay: null });
        return;
      }
      const { data } = await supabase
        .from('fixtures')
        .select(FIXTURE_SELECT)
        .eq('game_day', gameDay)
        .order('kickoff_utc');
      if (!cancelled) setState({ fixtures: (data as unknown as Fixture[]) ?? [], gameDay });
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  return state;
}
