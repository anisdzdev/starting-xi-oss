import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

export type NudgeResult = 'sent' | 'already' | 'failed';

/**
 * Nudge a friend: insert the nudges row (unique per sender→recipient per day —
 * THAT is the rate limit), then ask send-push to deliver the notification.
 */
export async function sendNudge(toUserId: string): Promise<NudgeResult> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'failed';

  const { error } = await supabase.from('nudges').insert({
    from_user: user.id,
    to_user: toUserId,
    game_day: currentGameDay(),
  });
  if (error) {
    // 23505 = unique_violation → already nudged today
    return error.code === '23505' ? 'already' : 'failed';
  }

  // push delivery is best-effort; the nudge row already counts
  await supabase.functions
    .invoke('send-push', { body: { kind: 'nudge', to_user: toUserId } })
    .catch(() => undefined);
  return 'sent';
}

/** Who have I already nudged today? (disables their buttons) */
export function useMyNudgesToday() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [nudged, setNudged] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await getSupabase()
      .from('nudges')
      .select('to_user')
      .eq('from_user', userId)
      .eq('game_day', currentGameDay());
    setNudged(new Set((data ?? []).map((n) => n.to_user as string)));
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    refresh();
  }, [refresh]);

  const markNudged = useCallback((toUserId: string) => {
    setNudged((prev) => new Set(prev).add(toUserId));
  }, []);

  return { nudged, markNudged };
}
