import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

// Mirror of supabase/functions/match-details/parseMatchDetails.ts payload.
export type LineupPlayer = {
  id: number;
  name: string;
  shirt: string | null;
  x: number;
  y: number;
  isMine: boolean;
  points: number | null;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  isMotm: boolean;
};
export type TeamLineup = { formation: string | null; players: LineupPlayer[] };
export type NewsItem = {
  id: string;
  title: string;
  image: string | null;
  source: string;
  url: string;
};
export type MatchDetails = {
  lineupType: 'confirmed' | 'predicted' | null;
  home: TeamLineup;
  away: TeamLineup;
  news: NewsItem[];
  fotmobUrl: string;
};

/**
 * Fetches the FotMob lineup + news for a fixture via the match-details edge
 * function. Mirrors the scout-card fetch in PlayerCardSheet (unwraps the
 * function's error message from fnErr.context).
 */
export function useMatchDetails(fotmobId: number, gameDay: string, enabled: boolean) {
  const [data, setData] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: fnErr } = await getSupabase().functions.invoke('match-details', {
      body: { fotmobId, gameDay },
    });
    if (fnErr || !res?.ok) {
      let message = fnErr?.message ?? res?.error ?? 'Could not load match details.';
      if (fnErr && 'context' in fnErr) {
        try {
          const b = await (fnErr as { context: Response }).context.json();
          if (b?.error) message = b.error;
        } catch {
          // keep generic message
        }
      }
      setError(message);
    } else {
      setData(res as MatchDetails);
    }
    setLoading(false);
  }, [fotmobId, gameDay]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state set after await
    load();
  }, [enabled, load]);

  return { data, loading, error, reload: load };
}
