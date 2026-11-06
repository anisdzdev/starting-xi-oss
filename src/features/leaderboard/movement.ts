// Pure movement baseline for the Overall board — unit-tested in movement.test.ts.
// `daily_leaderboard` emits a 0-point row the moment a roster/coach pick is saved,
// i.e. BEFORE kickoff — so "the latest played day" must be gated on days whose
// fixtures have actually started, not on the mere presence of a row.
// Game-day strings are YYYY-MM-DD, so lexical comparison == chronological.

/** Newest game day present in `rows` that is also in `startedDays`, or null. */
export function latestPlayedDay(
  rows: { game_day: string }[],
  startedDays: Set<string>
): string | null {
  let best: string | null = null;
  for (const r of rows) {
    if (!startedDays.has(r.game_day)) continue;
    if (best === null || r.game_day > best) best = r.game_day;
  }
  return best;
}
