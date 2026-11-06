import { getSupabase } from '@/lib/supabase';

/** Grant a per-game-day late-entry exception. Superuser only (enforced by RLS). */
export async function grantException(userId: string, gameDay: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('roster_exceptions')
    .upsert(
      { user_id: userId, game_day: gameDay, granted_by: user.id },
      { onConflict: 'user_id,game_day' }
    );
  if (error) throw new Error(error.message);
}

/** Revoke a previously granted exception. Superuser only (enforced by RLS). */
export async function revokeException(userId: string, gameDay: string): Promise<void> {
  const { error } = await getSupabase()
    .from('roster_exceptions')
    .delete()
    .eq('user_id', userId)
    .eq('game_day', gameDay);
  if (error) throw new Error(error.message);
}
