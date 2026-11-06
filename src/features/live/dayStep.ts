// Pure day-stepping for the DayStrip arrows — no React/Supabase imports,
// unit-tested in dayStep.test.ts.
//
// `days` are the fixture game days in ascending order. The selected day is
// often NOT a fixture day (a club season plays twice a week; an archived
// season's range end can be a placeholder date), so stepping must land on the
// nearest fixture day on the requested side rather than require membership.
// Game-day strings are YYYY-MM-DD, so lexical comparison == chronological.

export function stepDay(days: string[], selected: string, dir: 'older' | 'newer'): string | null {
  if (dir === 'older') {
    let best: string | null = null;
    for (const d of days) if (d < selected) best = d; // ascending → last one before wins
    return best;
  }
  for (const d of days) if (d > selected) return d; // ascending → first one after
  return null;
}
