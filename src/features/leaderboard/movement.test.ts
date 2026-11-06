import { describe, expect, it } from 'vitest';

import { latestPlayedDay } from './movement';

describe('latestPlayedDay', () => {
  const started = new Set(['2026-10-06', '2026-10-20', '2026-10-21']);

  it('is the newest game day with daily rows whose fixtures have started', () => {
    const rows = [
      { game_day: '2026-10-06' },
      { game_day: '2026-10-21' },
      { game_day: '2026-10-20' },
    ];
    expect(latestPlayedDay(rows, started)).toBe('2026-10-21');
  });

  it('ignores 0-point rows for a future day whose XI was already saved', () => {
    // daily_leaderboard emits a row as soon as a roster exists — before kickoff.
    const rows = [{ game_day: '2026-10-21' }, { game_day: '2026-11-03' }];
    expect(latestPlayedDay(rows, started)).toBe('2026-10-21');
  });

  it('is null with no rows or nothing started', () => {
    expect(latestPlayedDay([], started)).toBeNull();
    expect(latestPlayedDay([{ game_day: '2026-11-03' }], started)).toBeNull();
  });
});
