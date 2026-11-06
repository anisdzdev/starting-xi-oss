import { getSupabase } from '@/lib/supabase';

import { roundLabel } from './roundLabel';
import type { Round } from './types';

type RoundRow = {
  season_id: string;
  round_key: string;
  stage: string;
  matchday: number | null;
  starts_on: string;
  ends_on: string;
};

/** A season's rounds (from `season_rounds`), ascending by start day. */
export async function loadRounds(seasonId: string): Promise<Round[]> {
  const { data, error } = await getSupabase()
    .from('season_rounds')
    .select('season_id, round_key, stage, matchday, starts_on, ends_on')
    .eq('season_id', seasonId)
    .order('starts_on', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RoundRow[]).map((r) => ({
    seasonId: r.season_id,
    key: r.round_key,
    label: roundLabel(r.round_key),
    stage: r.stage,
    matchday: r.matchday === null ? null : Number(r.matchday),
    startsOn: r.starts_on,
    endsOn: r.ends_on,
  }));
}
