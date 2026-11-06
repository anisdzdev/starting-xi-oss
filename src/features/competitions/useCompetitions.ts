import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadCompetitions } from './api';
import type { Competition } from './types';

/**
 * A season's competitions. Refetched every time the screen gains focus (so a
 * join/create on a pushed screen shows up on return) and on pull-to-refresh.
 * Null while loading / until a season is known.
 */
export function useCompetitions(seasonId: string | null) {
  const [items, setItems] = useState<Competition[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!seasonId) return;
    try {
      setItems(await loadCompetitions(seasonId));
    } catch (e) {
      console.warn('competitions load failed', e);
      setItems((prev) => prev ?? []);
    }
  }, [seasonId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return { items, loading: items === null, refreshing, refresh, pullToRefresh };
}
