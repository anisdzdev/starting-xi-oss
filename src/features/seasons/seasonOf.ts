// Pure season helpers — no React/Supabase imports, unit-tested in seasonOf.test.ts.
// Game-day strings are YYYY-MM-DD, so lexical comparison == chronological.

import type { Season } from './types';

/** The active season, else the newest one (by start date), else null. */
export function pickActiveSeason(seasons: Season[]): Season | null {
  const active = seasons.find((s) => s.status === 'active');
  if (active) return active;
  return [...seasons].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
}

/** The season whose inclusive date range contains `day`, or null in a gap. */
export function seasonOfDay(seasons: Season[], day: string): Season | null {
  return seasons.find((s) => day >= s.startsOn && day <= s.endsOn) ?? null;
}

/**
 * Default day to open a season's Daily board on: today while the season is
 * running, its last day once it's over, its first day if it hasn't started.
 */
export function defaultDayFor(season: Season, today: string): string {
  if (today > season.endsOn) return season.endsOn;
  if (today < season.startsOn) return season.startsOn;
  return today;
}
