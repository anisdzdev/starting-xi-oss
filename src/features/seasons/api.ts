import { getSupabase } from '@/lib/supabase';

import type { Season } from './types';

type SeasonRow = {
  id: string;
  name: string;
  short_name: string;
  kind: 'nation' | 'club';
  fotmob_league_id: number;
  starts_on: string;
  ends_on: string;
  status: 'upcoming' | 'active' | 'archived';
  has_tournament_picks: boolean;
};

function toSeason(r: SeasonRow): Season {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    kind: r.kind,
    fotmobLeagueId: Number(r.fotmob_league_id),
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
    hasTournamentPicks: !!r.has_tournament_picks,
  };
}

/** Every season, newest first. Throws on a query error (caller decides how to degrade). */
export async function loadSeasons(): Promise<Season[]> {
  const { data, error } = await getSupabase()
    .from('seasons')
    .select('id, name, short_name, kind, fotmob_league_id, starts_on, ends_on, status, has_tournament_picks')
    .order('starts_on', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SeasonRow[]).map(toSeason);
}
