/**
 * FPL scoring rules — pure, dependency-free TypeScript.
 *
 * Used in TWO runtimes:
 *   - the app (imported as @/shared/scoring)
 *   - the poll-live Supabase Edge Function (Deno) via the byte-identical copy
 *     at supabase/functions/_shared/scoring.ts
 *
 * EDIT THIS FILE ONLY, then run `npm run sync:scoring` to refresh the copy.
 * A unit test fails if the two files drift.
 *
 * Captain handling: the multiplier is applied at ROSTER level (the SQL
 * leaderboard views double the captain's points). Nothing in this module
 * multiplies by captaincy — `fpl_points` stored per player-match is captainless.
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface MatchStats {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  penSaves: number;
  penMisses: number;
  yellows: number;
  reds: number;
  ownGoals: number;
  goalsConceded: number;
}

export const POINTS = {
  appearance: 1, // played any minutes
  appearance60: 2, // played 60+ minutes
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 } as Record<Position, number>,
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 } as Record<Position, number>, // requires 60+ min
  per3Saves: 1, // GK only
  penSave: 5,
  penMiss: -2,
  yellow: -1,
  red: -3,
  ownGoal: -2,
  per2Conceded: -1, // GK/DEF only
} as const;

/** Applied by the SQL leaderboard views, exported for client-side display parity. */
export const CAPTAIN_MULTIPLIER = 2;

/**
 * Coach of the Day scoring (display parity only). The runtime source of truth is the
 * SQL `coach_day_points` view (migration 20260619000000) — KEEP IN SYNC with it. The
 * coach scores from their team's SUBSTITUTES, the match result, and their own cards.
 */
export const COACH_POINTS = {
  subGoal: 3,
  subAssist: 2,
  subMotm: 3, // a substitute is Man of the Match
  win: 5,
  draw: 0,
  loss: -3,
  yellow: -1,
  red: -3,
} as const;

export function emptyStats(): MatchStats {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    saves: 0,
    penSaves: 0,
    penMisses: 0,
    yellows: 0,
    reds: 0,
    ownGoals: 0,
    goalsConceded: 0,
  };
}

/** Points from match actions, excluding bonus. 0 if the player didn't play. */
export function basePoints(position: Position, s: MatchStats): number {
  if (s.minutes <= 0) return 0;

  let pts = s.minutes >= 60 ? POINTS.appearance60 : POINTS.appearance;
  pts += s.goals * POINTS.goal[position];
  pts += s.assists * POINTS.assist;
  if (s.cleanSheet && s.minutes >= 60) pts += POINTS.cleanSheet[position];
  if (position === 'GK') pts += Math.floor(s.saves / 3) * POINTS.per3Saves;
  pts += s.penSaves * POINTS.penSave;
  pts += s.penMisses * POINTS.penMiss;
  pts += s.yellows * POINTS.yellow;
  pts += s.reds * POINTS.red;
  pts += s.ownGoals * POINTS.ownGoal;
  if (position === 'GK' || position === 'DEF') {
    pts += Math.floor(s.goalsConceded / 2) * POINTS.per2Conceded;
  }
  return pts;
}

export interface BonusCandidate {
  playerId: number;
  rating: number | null | undefined;
  minutes: number;
}

/**
 * Bonus 3/2/1 for the top-3 FotMob ratings in a fixture.
 *
 * Ties share the bonus of their (best) rank — competition ranking:
 *   9.1, 9.1, 8.5  → 3, 3, 1   (tie for 1st eats rank 2)
 *   9.1, 8.7, 8.7  → 3, 2, 2
 *   9.0, 8.0, 7.5, 7.5 → 3, 2, 1, 1
 * Deterministic: equal ratings always yield equal bonus; input order is irrelevant.
 * Only players who actually played and have a rating are eligible.
 */
export function computeBonus(candidates: BonusCandidate[]): Map<number, number> {
  const eligible = candidates.filter(
    (c) => c.minutes > 0 && typeof c.rating === 'number' && Number.isFinite(c.rating)
  );

  const bonusByRank: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
  const result = new Map<number, number>();
  for (const c of eligible) {
    const rank = eligible.filter((o) => (o.rating as number) > (c.rating as number)).length + 1;
    result.set(c.playerId, bonusByRank[rank] ?? 0);
  }
  return result;
}

/** Final per-player-match points as stored in player_match_stats.fpl_points. */
export function totalPoints(position: Position, s: MatchStats, bonus: number): number {
  return basePoints(position, s) + bonus;
}
