import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

/**
 * Does the current user hold a superuser-granted exception for `gameDay`?
 * Pass `null` to disable (e.g. while the build day is still resolving).
 * Subscribes to roster_exceptions so a grant/revoke flips the roster tab live.
 */
export function useMyException(gameDay: string | null) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [hasException, setHasException] = useState(false);
  const [loading, setLoading] = useState<boolean>(!!gameDay && !!userId);

  const fetchOne = useCallback(async () => {
    if (!gameDay || !userId) {
      setHasException(false);
      setLoading(false);
      return;
    }
    const { data } = await getSupabase()
      .from('roster_exceptions')
      .select('user_id')
      .eq('user_id', userId)
      .eq('game_day', gameDay)
      .maybeSingle();
    setHasException(!!data);
    setLoading(false);
  }, [gameDay, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state set only after await
    setLoading(!!gameDay && !!userId);
    fetchOne();
  }, [fetchOne, gameDay, userId]);

  useEffect(() => {
    if (!gameDay || !userId) return;
    const channel = getSupabase()
      .channel(`exception-${userId}-${gameDay}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'roster_exceptions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchOne();
        }
      )
      .subscribe();
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [fetchOne, gameDay, userId]);

  return { hasException, loading };
}
