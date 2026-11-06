import { useEffect } from 'react';
import { create } from 'zustand';

import { loadSeasons } from './api';
import { pickActiveSeason } from './seasonOf';
import type { Season } from './types';

// Seasons are reference data that changes a few times a year, so they're loaded
// once per app session (app/(app)/_layout.tsx) and shared from this store.
// `loaded` stays false until the first fetch settles — consumers treat a null
// active season as "loading", never as "no season".
type SeasonState = {
  seasons: Season[];
  /** First fetch settled (success or failure). */
  loaded: boolean;
  /** Last fetch failed and nothing is loaded — screens may call `load()` again. */
  failed: boolean;
  load: () => Promise<void>;
};

let inflight: Promise<void> | null = null;

export const useSeasonStore = create<SeasonState>((set, get) => ({
  seasons: [],
  loaded: false,
  failed: false,
  load: async () => {
    if (inflight) return inflight; // dedupe concurrent callers (layout + screens)
    inflight = (async () => {
      try {
        const seasons = await loadSeasons();
        set({ seasons, loaded: true, failed: false });
      } catch (e) {
        console.warn('seasons load failed', e);
        set({ loaded: true, failed: get().seasons.length === 0 });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));

/**
 * Re-fetch seasons when a previous attempt failed (e.g. a flaky cold start) —
 * call from screens that need them so they don't stay on a skeleton forever.
 */
export function useSeasonRetry() {
  const failed = useSeasonStore((s) => s.failed);
  const load = useSeasonStore((s) => s.load);
  useEffect(() => {
    if (failed) load();
  }, [failed, load]);
}

/** All seasons, newest first (empty until loaded). */
export function useSeasons(): Season[] {
  return useSeasonStore((s) => s.seasons);
}

/** The active season (else the newest). Null while loading. */
export function useActiveSeason(): Season | null {
  const seasons = useSeasonStore((s) => s.seasons);
  return pickActiveSeason(seasons);
}
