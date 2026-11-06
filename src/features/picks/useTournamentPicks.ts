import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

export type MyPicks = {
  team: { id: number; name: string; code: string; flag_url: string | null } | null;
  player: { id: number; name: string; image_url: string | null } | null;
  keeper: { id: number; name: string; image_url: string | null } | null;
};

export type PickPoints = { team: number | null; player: number | null; keeper: number | null };

/**
 * Fixed picks deadline: 2026-06-18 12:00 ET (16:00 UTC, EDT) — end of GW1, before
 * the second round of group games. The league started late, so we don't lock at
 * the opening match. KEEP IN SYNC with the v_deadline in the server trigger
 * (supabase/migrations/20260612070000_tournament_picks_deadline.sql).
 */
export const TOURNAMENT_PICKS_DEADLINE = Date.parse('2026-06-18T16:00:00Z');

/**
 * The signed-in user's tournament picks + lock state + current points per pick
 * from the three views. Lock rule: a hard deadline for everyone (matches the
 * server trigger). A latecomer who joins after it simply has no picks — they see
 * the closed state but aren't blocked from the app (blocking = !hasPicks &&
 * !locked, which is false once locked). No picking after the deadline: choosing a
 * team having seen GW1 results would be unfair.
 */
export function useTournamentPicks(seasonId: string | null) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [picks, setPicks] = useState<MyPicks | null | 'none'>(null);
  const [points, setPoints] = useState<PickPoints>({ team: null, player: null, keeper: null });

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (!seasonId) {
      // No season with picks (or seasons not loaded) → nothing to show, not loading.
      setPicks('none');
      return;
    }
    const supabase = getSupabase();
    const { data: pick } = await supabase
      .from('tournament_picks')
      .select(
        'team:teams(id, name, code, flag_url), ' +
          'player:players!tournament_picks_player_id_fkey(id, name, image_url), ' +
          'keeper:players!tournament_picks_keeper_id_fkey(id, name, image_url)'
      )
      .eq('user_id', userId)
      .eq('season_id', seasonId)
      .maybeSingle();

    if (!pick) {
      setPicks('none');
      return;
    }
    setPicks(pick as unknown as MyPicks);

    const [team, player, keeper] = await Promise.all([
      supabase
        .from('team_pick_leaderboard')
        .select('points')
        .eq('user_id', userId)
        .eq('season_id', seasonId)
        .maybeSingle(),
      supabase
        .from('player_pick_leaderboard')
        .select('points')
        .eq('user_id', userId)
        .eq('season_id', seasonId)
        .maybeSingle(),
      supabase
        .from('keeper_pick_leaderboard')
        .select('points')
        .eq('user_id', userId)
        .eq('season_id', seasonId)
        .maybeSingle(),
    ]);
    setPoints({
      team: team.data?.points ?? null,
      player: player.data?.points ?? null,
      keeper: keeper.data?.points ?? null,
    });
  }, [userId, seasonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    refresh();
  }, [refresh]);

  const hasPicks = picks !== null && picks !== 'none';
  const locked = Date.now() >= TOURNAMENT_PICKS_DEADLINE;

  return {
    picks,
    points,
    deadline: TOURNAMENT_PICKS_DEADLINE,
    locked,
    loading: picks === null,
    hasPicks,
    refresh,
  };
}

/** Upsert the user's tournament picks for a season (server trigger enforces the lock). */
export async function savePicks(
  seasonId: string,
  teamId: number,
  playerId: number,
  keeperId: number
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('tournament_picks').upsert(
    {
      user_id: user.id,
      season_id: seasonId,
      team_id: teamId,
      player_id: playerId,
      keeper_id: keeperId,
    },
    { onConflict: 'user_id,season_id' }
  );
  if (error) throw new Error(error.message);
}
