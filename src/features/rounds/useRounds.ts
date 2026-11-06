import { useEffect, useState } from 'react';

import { loadRounds } from './api';
import type { Round } from './types';

/**
 * A season's rounds, one-shot per season id (rounds only change when fixtures
 * are ingested — a few times a season). `null` while loading or when no
 * season is selected yet; `[]` when the season has no fixtures.
 */
export function useRounds(seasonId: string | null): Round[] | null {
  const [state, setState] = useState<{ seasonId: string; rounds: Round[] } | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    loadRounds(seasonId)
      .then((rounds) => {
        if (!cancelled) setState({ seasonId, rounds });
      })
      .catch((e) => {
        console.warn('rounds load failed', e);
        if (!cancelled) setState({ seasonId, rounds: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  // Never hand back another season's rounds while the new one is loading.
  return seasonId && state?.seasonId === seasonId ? state.rounds : null;
}
