import { useCallback, useEffect, useRef, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

import { firstActiveDay } from './buildDay';
import { useGameDay } from './useGameDay';

/**
 * The game day the roster builder targets: the earliest day >= today that still
 * has a non-finished fixture (status scheduled/live). It advances the instant
 * the current day's LAST match finishes — driven by fixture status, NOT the EST
 * midnight rule — and skips rest days. Falls back to today when nothing is left.
 *
 * Returns the same shape as useGameDay (fixtures/firstKickoff/liveCount/loading/
 * refetch) for the resolved build day, plus `buildDay` and `resolving`.
 */
export function useActiveGameDay() {
  const today = currentGameDay();
  const [buildDay, setBuildDay] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from('fixtures')
      .select('game_day')
      .in('status', ['scheduled', 'live'])
      .gte('game_day', today)
      .order('game_day');
    if (error) return;
    const days = [...new Set((data ?? []).map((r) => (r as { game_day: string }).game_day))];
    setBuildDay(firstActiveDay(days, today));
  }, [today]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async; state set after await
    resolve();
  }, [resolve]);

  // Recompute when ANY fixture status changes (e.g. the day's last match ends),
  // debounced so a burst of poll-live updates triggers one recompute.
  const channelId = useRef(`activeday-${Math.random().toString(36).slice(2)}`);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = getSupabase()
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fixtures' },
        () => {
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(resolve, 800);
        }
      )
      .subscribe();
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      getSupabase().removeChannel(channel);
    };
  }, [resolve]);

  // While buildDay is null, useGameDay(null) stays in its loading state.
  const day = useGameDay(buildDay);

  return { ...day, buildDay: buildDay ?? today, resolving: buildDay === null };
}
