/**
 * Game-day logic — pure, dependency-free, shared between the app and the
 * Supabase Edge Functions (byte-identical copy at
 * supabase/functions/_shared/gameday.ts — edit HERE, run `npm run sync:shared`).
 *
 * A "game day" is the slate of matches from one afternoon through the small
 * hours of the next morning. The boundary is an early-morning cutoff in US
 * Eastern time (`GAME_DAY_CUTOFF_HOUR`), NOT midnight: a kickoff before the
 * cutoff (e.g. a 12am–2am ET late game) belongs to the PREVIOUS day's slate.
 * Combined with the UTC→Eastern conversion, a 02:00 UTC match (10pm EDT) is the
 * same Eastern evening, and a 06:00 UTC match (2am EDT) is still that evening.
 *
 * This rule MUST match what ingest-fotmob writes into `fixtures.game_day` AND
 * the recompute in migration `20260613000000_gameday_cutoff.sql` (no auto-sync —
 * the cutoff hour is duplicated there with a cross-ref comment).
 */

export const GAME_DAY_TZ = 'America/New_York';

/**
 * The hour (US Eastern) at which one game day ends and the next begins. Kickoffs
 * before this hour roll into the previous calendar date's game day, so late
 * games (up to ~2am ET, even into extra time) stay with the prior evening.
 */
export const GAME_DAY_CUTOFF_HOUR = 6;

/** Eastern calendar date (YYYY-MM-DD) of a UTC instant. */
export function estDateOf(utc: string | number | Date): string {
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: GAME_DAY_TZ });
}

/**
 * The game day (YYYY-MM-DD) a UTC instant belongs to. Shifts the instant back by
 * the cutoff before taking the Eastern date, so kickoffs before
 * `GAME_DAY_CUTOFF_HOUR` ET fall into the previous Eastern date's game day.
 */
export function gameDayOf(utc: string | number | Date): string {
  const ms = new Date(utc).getTime() - GAME_DAY_CUTOFF_HOUR * 3_600_000;
  return estDateOf(ms);
}

/** Today's game day (YYYY-MM-DD), optionally offset by whole days. */
export function currentGameDay(offsetDays = 0, now: number = Date.now()): string {
  return gameDayOf(now + offsetDays * 86_400_000);
}

/** YYYY-MM-DD → YYYYMMDD (FotMob's date format). */
export function toYYYYMMDD(gameDay: string): string {
  return gameDay.replaceAll('-', '');
}
