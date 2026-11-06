import { getSupabase } from '@/lib/supabase';
import type { Position } from '@/shared/scoring';

import type { PickedPlayer } from './store';

export { validateRoster } from './validateRoster';

/**
 * Upsert the roster + its 11 slots. Throws with a readable message on failure.
 *
 * `finalize` is set for a LATE save (built after the day's first kickoff): it stamps
 * `rosters.locked_at` so the team locks immediately and can't be edited again — the
 * server `enforce_roster_lock()` trigger rejects any further writes once it's set.
 * Pre-kickoff saves pass `finalize: false` so edits stay unlimited until kickoff.
 */
export async function saveRoster(
  gameDay: string,
  formationCode: string,
  slots: (PickedPlayer | null)[],
  captainId: number,
  finalize = false
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: roster, error: rosterErr } = await supabase
    .from('rosters')
    .upsert(
      {
        user_id: user.id,
        game_day: gameDay,
        formation_code: formationCode,
        captain_player_id: captainId,
      },
      { onConflict: 'user_id,game_day' }
    )
    .select('id')
    .single();
  if (rosterErr) throw new Error(rosterErr.message);

  const { error: delErr } = await supabase
    .from('roster_players')
    .delete()
    .eq('roster_id', roster.id);
  if (delErr) throw new Error(delErr.message);

  const rows = slots.flatMap((p, i) =>
    p ? [{ roster_id: roster.id, player_id: p.id, slot_position: i + 1 }] : []
  );
  const { error: insErr } = await supabase.from('roster_players').insert(rows);
  if (insErr) throw new Error(insErr.message);

  // Late save: lock the team immediately (must happen AFTER the player rows are in —
  // the trigger/RLS reject roster_players writes once locked_at is set).
  if (finalize) {
    const { error: lockErr } = await supabase
      .from('rosters')
      .update({ locked_at: new Date().toISOString() })
      .eq('id', roster.id);
    if (lockErr) throw new Error(lockErr.message);
  }
}

export type SavedRoster = {
  formationCode: string;
  captainId: number | null;
  players: { slot: number; player: PickedPlayer }[];
};

/** Load the user's saved roster for a game day (null when none). */
export async function loadRoster(gameDay: string): Promise<SavedRoster | null> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: raw } = await supabase
    .from('rosters')
    .select(
      'formation_code, captain_player_id, roster_players(slot_position, ' +
        'player:players(id, name, position, image_url, team:teams(code, flag_url)))'
    )
    .eq('user_id', user.id)
    .eq('game_day', gameDay)
    .maybeSingle();
  if (!raw) return null;
  const data = raw as unknown as {
    formation_code: string;
    captain_player_id: number | null;
    roster_players: unknown[];
  };

  const players = ((data.roster_players ?? []) as unknown as {
    slot_position: number;
    player: {
      id: number;
      name: string;
      position: Position;
      image_url: string | null;
      team: { code: string; flag_url: string | null };
    };
  }[]).map((rp) => ({
    slot: rp.slot_position,
    player: {
      id: rp.player.id,
      name: rp.player.name,
      position: rp.player.position,
      imageUrl: rp.player.image_url,
      teamCode: rp.player.team.code,
      flagUrl: rp.player.team.flag_url,
    },
  }));

  return {
    formationCode: data.formation_code,
    captainId: data.captain_player_id,
    players,
  };
}
