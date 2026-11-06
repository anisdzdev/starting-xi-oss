import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  basePoints,
  CAPTAIN_MULTIPLIER,
  computeBonus,
  emptyStats,
  totalPoints,
  type MatchStats,
} from './scoring';

const stats = (overrides: Partial<MatchStats>): MatchStats => ({ ...emptyStats(), ...overrides });

describe('basePoints', () => {
  it('GK clean sheet: 90min + CS + 3 saves = 2 + 4 + 1', () => {
    expect(basePoints('GK', stats({ minutes: 90, cleanSheet: true, saves: 3 }))).toBe(7);
  });

  it('DEF conceding 4: 90min appearance cancelled by -1 per 2 conceded', () => {
    expect(basePoints('DEF', stats({ minutes: 90, goalsConceded: 4 }))).toBe(0); // 2 - 2
  });

  it('MID is not docked for goals conceded', () => {
    expect(basePoints('MID', stats({ minutes: 90, goalsConceded: 4 }))).toBe(2);
  });

  it('MID 2 goals: 2 + 2*5', () => {
    expect(basePoints('MID', stats({ minutes: 90, goals: 2 }))).toBe(12);
  });

  it('sub playing 20min gets 1 appearance point and NO clean-sheet points', () => {
    expect(basePoints('DEF', stats({ minutes: 20, cleanSheet: true }))).toBe(1);
  });

  it('did not play → 0, regardless of other fields', () => {
    expect(basePoints('FWD', stats({ minutes: 0, goals: 3, cleanSheet: true }))).toBe(0);
  });

  it('red card: 90min MID with a red = 2 - 3', () => {
    expect(basePoints('MID', stats({ minutes: 90, reds: 1 }))).toBe(-1);
  });

  it('pen save: GK 90min, 1 pen save, 4 saves, 1 conceded = 2 + 5 + 1 + 0', () => {
    expect(
      basePoints('GK', stats({ minutes: 90, penSaves: 1, saves: 4, goalsConceded: 1 }))
    ).toBe(8);
  });

  it('pen miss costs 2', () => {
    expect(basePoints('FWD', stats({ minutes: 90, penMisses: 1 }))).toBe(0); // 2 - 2
  });

  it('goal values are position-aware (GK/DEF 6, MID 5, FWD 4)', () => {
    expect(basePoints('GK', stats({ minutes: 90, goals: 1 }))).toBe(8);
    expect(basePoints('DEF', stats({ minutes: 90, goals: 1 }))).toBe(8);
    expect(basePoints('MID', stats({ minutes: 90, goals: 1 }))).toBe(7);
    expect(basePoints('FWD', stats({ minutes: 90, goals: 1 }))).toBe(6);
  });

  it('kitchen sink: FWD 70min, 1 goal, 1 assist, 1 yellow, 1 own goal', () => {
    expect(
      basePoints('FWD', stats({ minutes: 70, goals: 1, assists: 1, yellows: 1, ownGoals: 1 }))
    ).toBe(2 + 4 + 3 - 1 - 2);
  });
});

describe('computeBonus', () => {
  const c = (playerId: number, rating: number | null, minutes = 90) => ({
    playerId,
    rating,
    minutes,
  });

  it('plain top-3 get 3/2/1, everyone else 0', () => {
    const b = computeBonus([c(1, 9.0), c(2, 8.5), c(3, 8.0), c(4, 7.0)]);
    expect([b.get(1), b.get(2), b.get(3), b.get(4)]).toEqual([3, 2, 1, 0]);
  });

  it('tie for 1st: both get 3, next gets 1 (rank 2 consumed)', () => {
    const b = computeBonus([c(1, 9.1), c(2, 9.1), c(3, 8.5)]);
    expect([b.get(1), b.get(2), b.get(3)]).toEqual([3, 3, 1]);
  });

  it('tie for 2nd: 3/2/2 and nobody gets 1', () => {
    const b = computeBonus([c(1, 9.1), c(2, 8.7), c(3, 8.7), c(4, 8.0)]);
    expect([b.get(1), b.get(2), b.get(3), b.get(4)]).toEqual([3, 2, 2, 0]);
  });

  it('tie for 3rd: both get 1', () => {
    const b = computeBonus([c(1, 9.0), c(2, 8.0), c(3, 7.5), c(4, 7.5)]);
    expect([b.get(3), b.get(4)]).toEqual([1, 1]);
  });

  it('is deterministic regardless of input order', () => {
    const players = [c(1, 9.1), c(2, 9.1), c(3, 8.5), c(4, 8.0)];
    const forward = computeBonus(players);
    const reversed = computeBonus([...players].reverse());
    for (const id of [1, 2, 3, 4]) {
      expect(forward.get(id)).toBe(reversed.get(id));
    }
  });

  it('unrated and unused players are not eligible', () => {
    const b = computeBonus([c(1, 9.0), c(2, null), c(3, 8.0, 0)]);
    expect(b.get(1)).toBe(3);
    expect(b.has(2)).toBe(false);
    expect(b.has(3)).toBe(false);
  });
});

describe('totalPoints & captain', () => {
  it('total = base + bonus', () => {
    expect(totalPoints('MID', stats({ minutes: 90, goals: 2 }), 3)).toBe(15);
  });

  it('captain multiplier is 2 and lives at roster level, not in per-player stats', () => {
    expect(CAPTAIN_MULTIPLIER).toBe(2);
  });
});

describe('deno copies stay in sync (run npm run sync:shared)', () => {
  for (const file of ['scoring.ts', 'gameday.ts']) {
    it(`supabase/functions/_shared/${file} is byte-identical to src/shared/${file}`, () => {
      const root = join(__dirname, '..', '..');
      const app = readFileSync(join(root, 'src/shared', file), 'utf8');
      const deno = readFileSync(join(root, 'supabase/functions/_shared', file), 'utf8');
      expect(deno).toBe(app);
    });
  }
});
