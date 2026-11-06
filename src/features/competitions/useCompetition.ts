import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

import { loadCompetition } from './api';
import type { Competition, CompetitionStanding } from './types';

type State = { competition: Competition; standings: CompetitionStanding[] } | null | 'missing';

/**
 * One competition with live standings: any player_match_stats change triggers a
 * debounced refetch (same pattern as the Standings boards). `refresh` is exposed
 * for join / leave / pick actions.
 */
export function useCompetition(id: string | null) {
  const [state, setState] = useState<State>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const data = await loadCompetition(id);
      setState(data ?? 'missing');
    } catch (e) {
      console.warn('competition load failed', e);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    setState(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = getSupabase()
      .channel(`competition-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_match_stats' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, 1500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(channel);
    };
  }, [id, refresh]);

  return {
    competition: state && state !== 'missing' ? state.competition : null,
    standings: state && state !== 'missing' ? state.standings : null,
    missing: state === 'missing',
    loading: state === null,
    refresh,
  };
}
