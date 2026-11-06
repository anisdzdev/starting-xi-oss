import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

const STALE_AFTER_MS = 5 * 60_000; // poll runs every 2 min; >5 min quiet = delayed
const CHECK_EVERY_MS = 60_000;

export type StaleInfo = { lastAt: number | null };

/**
 * While matches are live, watch the poll-live heartbeat (sync_state.poll_live).
 * Returns stale info when the poller is quiet too long or reporting failures —
 * drives the "Live data delayed" banner.
 */
export function useStaleLiveData(anyLive: boolean): StaleInfo | null {
  const [stale, setStale] = useState<StaleInfo | null>(null);

  useEffect(() => {
    if (!anyLive) {
      setStale(null);
      return;
    }
    let cancelled = false;

    const check = async () => {
      const { data } = await getSupabase()
        .from('sync_state')
        .select('value, updated_at')
        .eq('key', 'poll_live')
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        // poller has never run while a match is live → delayed
        setStale({ lastAt: null });
        return;
      }
      const lastAt = new Date(data.updated_at).getTime();
      const failing = (data.value as { ok?: boolean } | null)?.ok === false;
      setStale(Date.now() - lastAt > STALE_AFTER_MS || failing ? { lastAt } : null);
    };

    check();
    const id = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyLive]);

  return stale;
}
