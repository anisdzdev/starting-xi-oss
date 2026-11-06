import { describe, expect, it } from 'vitest';

import {
  approxMinute,
  buildActivityState,
  type ActivityFixture,
  type ActivityRosterPlayer,
} from './buildActivityState.ts';

const NOW = Date.parse('2026-06-14T20:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// Canada–Morocco is LIVE (kicked off 63' ago), Brazil–Mexico FINISHED,
// South Africa–France SCHEDULED.
const fixtures: ActivityFixture[] = [
  {
    fixtureId: 100, homeCode: 'CAN', awayCode: 'MAR',
    homeScore: 2, awayScore: 1, status: 'live', kickoffUtc: minsAgo(63),
  },
  {
    fixtureId: 101, homeCode: 'BRA', awayCode: 'MEX',
    homeScore: 1, awayScore: 0, status: 'finished', kickoffUtc: minsAgo(200),
  },
  {
    fixtureId: 102, homeCode: 'RSA', awayCode: 'FRA',
    homeScore: null, awayScore: null, status: 'scheduled', kickoffUtc: minsAgo(-30),
  },
];

const players: ActivityRosterPlayer[] = [
  { id: 1, name: 'Alphonso Davies', position: 'DEF', teamCode: 'CAN', fixtureId: 100, points: 9, isCaptain: true },
  { id: 2, name: 'Cyle Larin', position: 'FWD', teamCode: 'CAN', fixtureId: 100, points: 9, isCaptain: false },
  { id: 3, name: 'Youssef En-Nesyri', position: 'FWD', teamCode: 'MAR', fixtureId: 100, points: 4, isCaptain: false },
  { id: 4, name: 'Lucas Paqueta', position: 'MID', teamCode: 'BRA', fixtureId: 101, points: 7, isCaptain: false },
  { id: 5, name: 'Hugo Lloris', position: 'GK', teamCode: 'FRA', fixtureId: 102, points: 0, isCaptain: false },
];

describe('buildActivityState', () => {
  it('returns null when no relevant match is live', () => {
    const onlyScheduledOrFinished = fixtures.filter((f) => f.fixtureId !== 100);
    const state = buildActivityState({
      players, fixtures: onlyScheduledOrFinished, nowMs: NOW,
    });
    expect(state).toBeNull();
  });

  it('returns null when a live match has none of the user players', () => {
    const lonePlayer: ActivityRosterPlayer[] = [
      { id: 9, name: 'No One', position: 'MID', teamCode: 'GER', fixtureId: 999, points: 5, isCaptain: false },
    ];
    const state = buildActivityState({ players: lonePlayer, fixtures, nowMs: NOW });
    expect(state).toBeNull();
  });

  it('uses the focused layout for exactly one relevant live match', () => {
    const state = buildActivityState({ players, fixtures, nowMs: NOW })!;
    expect(state).not.toBeNull();
    expect(state.layout).toBe('focused');
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0]).toMatchObject({
      homeCode: 'CAN', awayCode: 'MAR', homeScore: 2, awayScore: 1,
      playerCount: 3, hasCaptain: true,
    });
  });

  it('doubles the captain in the total and in player display points', () => {
    const state = buildActivityState({ players, fixtures, nowMs: NOW })!;
    // 18 (Davies×2) + 9 + 4 + 7 (finished BRA) + 0 = 38 — includes finished matches
    expect(state.totalPoints).toBe(38);
    const davies = state.players.find((p) => p.id === 1)!;
    expect(davies.points).toBe(18);
    expect(davies.isCaptain).toBe(true);
  });

  it('contributes only the live match points to that match row', () => {
    const state = buildActivityState({ players, fixtures, nowMs: NOW })!;
    expect(state.matches[0].contributedPoints).toBe(31); // 18 + 9 + 4
  });

  it('lists live-match players sorted by display points desc', () => {
    const state = buildActivityState({ players, fixtures, nowMs: NOW })!;
    expect(state.players.map((p) => p.id)).toEqual([1, 2, 3]); // 18, 9, 4
    expect(state.players[0].initials).toBe('AD');
    expect(state.players[2].initials).toBe('YE');
  });

  it('prefers the real live minute over the kickoff approximation', () => {
    const withMinute = fixtures.map((f) =>
      f.fixtureId === 100 ? { ...f, liveMinute: "66'" } : f
    );
    const state = buildActivityState({ players, fixtures: withMinute, nowMs: NOW })!;
    expect(state.matches[0].minute).toBe("66'");
  });

  it('uses the multi layout for 2–3 relevant live matches', () => {
    const twoLive = fixtures.map((f) =>
      f.fixtureId === 101 ? { ...f, status: 'live' as const } : f
    );
    const state = buildActivityState({ players, fixtures: twoLive, nowMs: NOW })!;
    expect(state.layout).toBe('multi');
    expect(state.matches).toHaveLength(2);
    const bra = state.matches.find((m) => m.homeCode === 'BRA')!;
    expect(bra.contributedPoints).toBe(7);
    expect(bra.playerCount).toBe(1);
  });

  it('caps the players list to maxPlayers, keeping the highest scorers', () => {
    const many: ActivityRosterPlayer[] = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, name: `Player ${i + 1}`, position: 'MID' as const,
      teamCode: 'CAN', fixtureId: 100, points: i + 1, isCaptain: false,
    }));
    const state = buildActivityState({ players: many, fixtures, nowMs: NOW, maxPlayers: 6 })!;
    expect(state.players).toHaveLength(6);
    expect(state.players[0].points).toBe(9); // highest first
    expect(state.players.at(-1)!.points).toBe(4); // 9..4 kept, 3..1 dropped
  });

  it('passes through the optional lastEvent and stamps updatedAt', () => {
    const state = buildActivityState({
      players, fixtures, nowMs: NOW, lastEvent: 'Davies +6 · Goal (captain ×2)',
    })!;
    expect(state.lastEvent).toBe('Davies +6 · Goal (captain ×2)');
    expect(state.updatedAt).toBe(Math.floor(NOW / 1000));
  });
});

describe('approxMinute', () => {
  it("returns FT for finished matches", () => {
    expect(approxMinute('finished', minsAgo(200), NOW)).toBe('FT');
  });
  it('returns null for scheduled matches', () => {
    expect(approxMinute('scheduled', minsAgo(-30), NOW)).toBeNull();
  });
  it('approximates the live minute from kickoff', () => {
    expect(approxMinute('live', minsAgo(63), NOW)).toBe("63'");
    expect(approxMinute('live', minsAgo(10), NOW)).toBe("10'");
  });
  it("caps stoppage/extra time at 90+'", () => {
    expect(approxMinute('live', minsAgo(105), NOW)).toBe("90+'");
  });
});
