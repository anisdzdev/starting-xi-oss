/**
 * Pure build-day selection — which game day the roster builder targets.
 * Dependency-free (no React/RN/Supabase imports) so it runs under vitest like
 * the other shared logic. See docs/.../next-gameday-build for the rationale.
 */

/**
 * Given the game days that still have a non-finished fixture (status
 * scheduled/live) and today's game day, return the earliest such day >= today.
 * Falls back to `today` when none qualify (e.g. the tournament is over).
 * Game-day strings are YYYY-MM-DD, so lexical comparison == chronological.
 */
export function firstActiveDay(activeDays: string[], today: string): string {
  const eligible = activeDays.filter((d) => d >= today).sort();
  return eligible[0] ?? today;
}
