import { describe, expect, it } from 'vitest';

import { currentGameDay, estDateOf, gameDayOf, toYYYYMMDD } from './gameday';

/**
 * Game-day boundary tests. The rule: a fixture belongs to a game day that runs
 * from one afternoon through GAME_DAY_CUTOFF_HOUR (6am ET) the NEXT morning, so
 * late kickoffs (up to ~2am ET) stay with the prior evening's slate. Summer
 * World Cup dates are EDT (UTC−4); winter dates are EST (UTC−5) — both must work.
 */

describe('estDateOf — raw Eastern calendar date (no cutoff)', () => {
  it('a 19:00 UTC kickoff is the same calendar day', () => {
    expect(estDateOf('2026-06-11T19:00:00Z')).toBe('2026-06-11');
  });

  it('02:00 UTC (10pm EDT) is the previous calendar day', () => {
    expect(estDateOf('2026-06-12T02:00:00Z')).toBe('2026-06-11');
  });

  it('04:00 UTC (midnight EDT) is already the next calendar day', () => {
    expect(estDateOf('2026-06-12T04:00:00Z')).toBe('2026-06-12');
  });
});

describe('gameDayOf — EDT (summer, UTC−4), 6am cutoff', () => {
  it('a 19:00 UTC kickoff (3pm EDT) is an afternoon game that day', () => {
    expect(gameDayOf('2026-06-11T19:00:00Z')).toBe('2026-06-11');
  });

  it('02:00 UTC (10pm EDT) belongs to that evening', () => {
    expect(gameDayOf('2026-06-12T02:00:00Z')).toBe('2026-06-11');
  });

  it('04:00 UTC (midnight EDT) still belongs to the prior evening', () => {
    expect(gameDayOf('2026-06-12T04:00:00Z')).toBe('2026-06-11');
  });

  it('06:00 UTC (2am EDT) — the latest late game — still the prior evening', () => {
    expect(gameDayOf('2026-06-12T06:00:00Z')).toBe('2026-06-11');
  });

  it('09:59 UTC (5:59am EDT) is still the prior evening (just before cutoff)', () => {
    expect(gameDayOf('2026-06-12T09:59:00Z')).toBe('2026-06-11');
  });

  it('10:00 UTC (6am EDT) flips to the new game day (at the cutoff)', () => {
    expect(gameDayOf('2026-06-12T10:00:00Z')).toBe('2026-06-12');
  });
});

describe('gameDayOf — EST (winter, UTC−5), 6am cutoff', () => {
  it('06:00 UTC (1am EST) belongs to the prior evening', () => {
    expect(gameDayOf('2026-01-15T06:00:00Z')).toBe('2026-01-14');
  });

  it('10:59 UTC (5:59am EST) is still the prior evening', () => {
    expect(gameDayOf('2026-01-15T10:59:00Z')).toBe('2026-01-14');
  });

  it('11:00 UTC (6am EST) flips to the new game day', () => {
    expect(gameDayOf('2026-01-15T11:00:00Z')).toBe('2026-01-15');
  });
});

describe('currentGameDay — applies the cutoff to "now"', () => {
  it('an afternoon instant maps to that day', () => {
    const afternoon = Date.parse('2026-06-11T19:00:00Z'); // 3pm EDT June 11
    expect(currentGameDay(0, afternoon)).toBe('2026-06-11');
  });

  it('12:10am EDT still belongs to the prior evening (the key fix)', () => {
    const justAfterMidnightEDT = Date.parse('2026-06-12T04:10:00Z');
    expect(currentGameDay(0, justAfterMidnightEDT)).toBe('2026-06-11');
  });

  it('2am EDT (a late game in progress) is still the prior evening', () => {
    const twoAmEDT = Date.parse('2026-06-12T06:00:00Z');
    expect(currentGameDay(0, twoAmEDT)).toBe('2026-06-11');
  });

  it('7am EDT has flipped to the new game day', () => {
    const sevenAmEDT = Date.parse('2026-06-12T11:00:00Z');
    expect(currentGameDay(0, sevenAmEDT)).toBe('2026-06-12');
  });

  it('offsetDays walks whole days from the resolved game day', () => {
    const base = Date.parse('2026-06-12T01:00:00Z'); // 9pm EDT June 11 → game day June 11
    expect(currentGameDay(0, base)).toBe('2026-06-11');
    expect(currentGameDay(1, base)).toBe('2026-06-12');
    expect(currentGameDay(-1, base)).toBe('2026-06-10');
  });
});

describe('toYYYYMMDD', () => {
  it('formats for the FotMob date endpoint', () => {
    expect(toYYYYMMDD('2026-06-11')).toBe('20260611');
  });
});
