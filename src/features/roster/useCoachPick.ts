import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

export type CoachPickCoach = {
  id: number;
  name: string;
  image_url: string | null;
  team: { id: number; name: string; code: string; flag_url: string | null };
};

export type CoachBreakdown = {
  subGoals: number;
  subAssists: number;
  motm: number;
  result: number;
  cards: number;
};

export type CoachPickState = {
  pick: CoachPickCoach | null;
  hasPick: boolean;
  lockedAt: string | null;
  createdAt: string | null;
  points: number | null;
  breakdown: CoachBreakdown | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useCoachPick(gameDay: string | null, targetUserId?: string): CoachPickState {
  const { session } = useSession();
  const userId = targetUserId ?? session?.user.id ?? null;
  const [pick, setPick] = useState<CoachPickCoach | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<CoachBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId || !gameDay) return;
    const supabase = getSupabase();
    const { data: row } = await supabase
      .from('coach_picks')
      .select(
        'locked_at, created_at, ' +
          'coach:coaches(id, name, image_url, team:teams(id, name, code, flag_url))'
      )
      .eq('user_id', userId)
      .eq('game_day', gameDay)
      .maybeSingle();

    setPick(((row as Record<string, any>)?.coach as CoachPickCoach) ?? null);
    setLockedAt((row as Record<string, any>)?.locked_at ?? null);
    setCreatedAt((row as Record<string, any>)?.created_at ?? null);

    const { data: pts } = await supabase
      .from('coach_day_points')
      .select('points, sub_goal_pts, sub_assist_pts, motm_pts, result_pts, card_pts')
      .eq('user_id', userId)
      .eq('game_day', gameDay)
      .maybeSingle();
    const p = pts as Record<string, any> | null;
    setPoints(p?.points ?? null);
    setBreakdown(
      p
        ? {
            subGoals: p.sub_goal_pts,
            subAssists: p.sub_assist_pts,
            motm: p.motm_pts,
            result: p.result_pts,
            cards: p.card_pts,
          }
        : null
    );
    setLoading(false);
  }, [userId, gameDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state set after await
    refresh();
    if (!gameDay) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel(`coachpick-${gameDay}-${userId ?? 'me'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_match_stats' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_match_stats' }, () => {
        refresh();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fixtures', filter: `game_day=eq.${gameDay}` },
        () => {
          refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh, gameDay, userId]);

  return {
    pick,
    hasPick: pick !== null,
    lockedAt,
    createdAt,
    points,
    breakdown,
    loading,
    refresh,
  };
}

/** Upsert the user's coach pick. finalize=true (a late save) stamps locked_at AFTER
 *  the upsert — stamping in the same write would trip the lock trigger. */
export async function saveCoachPick(
  gameDay: string,
  coachId: number,
  teamId: number,
  finalize: boolean
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('coach_picks')
    .upsert(
      { user_id: user.id, game_day: gameDay, coach_id: coachId, team_id: teamId },
      { onConflict: 'user_id,game_day' }
    );
  if (error) throw new Error(error.message);
  if (finalize) {
    const { error: lockErr } = await supabase
      .from('coach_picks')
      .update({ locked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('game_day', gameDay);
    if (lockErr) throw new Error(lockErr.message);
  }
}

/** Coaches of teams playing on the given game day (for the picker). */
export async function loadPickableCoaches(
  teamIds: number[]
): Promise<{ id: number; name: string; team_id: number; image_url: string | null }[]> {
  if (teamIds.length === 0) return [];
  const supabase = getSupabase();
  const { data } = await supabase
    .from('coaches')
    .select('id, name, team_id, image_url')
    .in('team_id', teamIds);
  return data ?? [];
}
