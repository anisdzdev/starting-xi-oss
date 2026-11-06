/**
 * Build the Live Activity content-state from a user's roster + today's stats.
 *
 * Pure & dependency-free (no Deno/DB access) so it runs in the edge function
 * AND is unit-testable in vitest. The edge function does the querying and hands
 * normalized rows here.
 *
 * Captain handling mirrors the leaderboard views: the ×2 is applied at roster
 * level. `points` on the inputs is the captainless per-day total (sum of
 * `player_match_stats.fpl_points`); this module doubles the captain for both
 * the headline total and the per-player display value, so the widget renders
 * the number as-is.
 *
 * The content-state must stay under the APNs 4KB limit, so `players` is capped
 * (default 6) to the highest scorers.
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface ActivityFixture {
  fixtureId: number;
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  status: FixtureStatus;
  kickoffUtc: string; // ISO — used to approximate the live minute when liveMinute is absent
  liveMinute?: string | null; // real clock from FotMob (e.g. "66'", "HT"); preferred over the approximation
}

export interface ActivityRosterPlayer {
  id: number;
  name: string;
  position: Position;
  teamCode: string;
  fixtureId: number | null; // today's fixture the player's team is in
  points: number; // captainless per-day fpl_points total
  isCaptain: boolean;
}

export interface BuildInput {
  players: ActivityRosterPlayer[];
  fixtures: ActivityFixture[];
  nowMs: number;
  lastEvent?: string;
  maxPlayers?: number;
}

export interface ActivityMatch {
  homeCode: string;
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: string | null;
  contributedPoints: number;
  playerCount: number;
  hasCaptain: boolean;
}

export interface ActivityPlayer {
  id: number;
  initials: string;
  position: Position;
  teamCode: string;
  points: number; // display points (captain already doubled)
  isCaptain: boolean;
}

export interface ContentState {
  layout: 'focused' | 'multi';
  totalPoints: number;
  updatedAt: number; // epoch seconds
  matches: ActivityMatch[];
  players: ActivityPlayer[];
  lastEvent?: string;
}

const DEFAULT_MAX_PLAYERS = 6;

/** Two-letter monogram: first letter of the first + last name token. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Approximate match clock from kickoff — the DB stores no minute. */
export function approxMinute(
  status: FixtureStatus,
  kickoffUtc: string,
  nowMs: number
): string | null {
  if (status === 'finished') return 'FT';
  if (status !== 'live') return null;
  const elapsed = Math.floor((nowMs - Date.parse(kickoffUtc)) / 60_000);
  if (elapsed >= 90) return "90+'";
  return `${Math.max(0, elapsed)}'`;
}

const displayPoints = (p: ActivityRosterPlayer): number => p.points * (p.isCaptain ? 2 : 1);

export function buildActivityState(input: BuildInput): ContentState | null {
  const { players, fixtures, nowMs, lastEvent } = input;
  const maxPlayers = input.maxPlayers ?? DEFAULT_MAX_PLAYERS;

  const byId = new Map(fixtures.map((f) => [f.fixtureId, f]));
  const liveFixtureIds = new Set(
    fixtures.filter((f) => f.status === 'live').map((f) => f.fixtureId)
  );

  // Relevant live matches: live AND containing ≥1 of the user's players.
  const relevantIds = new Set<number>();
  for (const p of players) {
    if (p.fixtureId != null && liveFixtureIds.has(p.fixtureId)) relevantIds.add(p.fixtureId);
  }
  if (relevantIds.size === 0) return null;

  // Headline total is the user's whole-day points (incl. finished matches).
  const totalPoints = players.reduce((sum, p) => sum + displayPoints(p), 0);

  const matches: ActivityMatch[] = [...relevantIds]
    .map((id) => byId.get(id)!)
    .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc))
    .map((f) => {
      const inMatch = players.filter((p) => p.fixtureId === f.fixtureId);
      return {
        homeCode: f.homeCode,
        awayCode: f.awayCode,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        // real FotMob clock when we have it; kickoff approximation otherwise
        minute: f.liveMinute ?? approxMinute(f.status, f.kickoffUtc, nowMs),
        contributedPoints: inMatch.reduce((s, p) => s + displayPoints(p), 0),
        playerCount: inMatch.length,
        hasCaptain: inMatch.some((p) => p.isCaptain),
      };
    });

  const activityPlayers: ActivityPlayer[] = players
    .filter((p) => p.fixtureId != null && relevantIds.has(p.fixtureId))
    .map((p) => ({
      id: p.id,
      initials: initialsOf(p.name),
      position: p.position,
      teamCode: p.teamCode,
      points: displayPoints(p),
      isCaptain: p.isCaptain,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, maxPlayers);

  return {
    layout: relevantIds.size === 1 ? 'focused' : 'multi',
    totalPoints,
    updatedAt: Math.floor(nowMs / 1000),
    matches,
    players: activityPlayers,
    ...(lastEvent ? { lastEvent } : {}),
  };
}
