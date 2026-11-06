import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

export type XIStatus = 'none' | 'building' | 'locked';

export type MyRoster = {
  status: XIStatus;
  pickedCount: number;
  /** Live/final points for the day (from daily_leaderboard, captain ×2 included). */
  points: number | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

/** The signed-in user's roster state for a game day. */
export function useMyRoster(gameDay: string | null): MyRoster {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<Omit<MyRoster, 'refetch'>>({
    status: 'none',
    pickedCount: 0,
    points: null,
    loading: true,
  });

  const refetch = useCallback(async () => {
    if (!userId || !gameDay) return;
    const supabase = getSupabase();

    const [{ data: roster }, { data: board }] = await Promise.all([
      supabase
        .from('rosters')
        .select('id, locked_at, roster_players(count)')
        .eq('user_id', userId)
        .eq('game_day', gameDay)
        .maybeSingle(),
      supabase
        .from('daily_leaderboard')
        .select('points')
        .eq('user_id', userId)
        .eq('game_day', gameDay)
        .maybeSingle(),
    ]);

    const pickedCount =
      (roster?.roster_players as { count: number }[] | undefined)?.[0]?.count ?? 0;
    setState({
      status: !roster ? 'none' : roster.locked_at ? 'locked' : 'building',
      pickedCount,
      points: board?.points ?? null,
      loading: false,
    });
  }, [userId, gameDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
