import { describe, expect, it } from 'vitest';

import { firstActiveDay } from './buildDay';

describe('firstActiveDay', () => {
  it('returns today when today still has active fixtures', () => {
    expect(firstActiveDay(['2026-06-12', '2026-06-15'], '2026-06-12')).toBe('2026-06-12');
  });

  it('skips rest days to the next day that has fixtures', () => {
    // today (06-12) has no active fixtures left; the next active day is 06-15
    expect(firstActiveDay(['2026-06-15', '2026-06-18'], '2026-06-12')).toBe('2026-06-15');
  });

  it('ignores days before today', () => {
    expect(firstActiveDay(['2026-06-10', '2026-06-15'], '2026-06-12')).toBe('2026-06-15');
  });

  it('handles unsorted input', () => {
    expect(firstActiveDay(['2026-06-18', '2026-06-15'], '2026-06-12')).toBe('2026-06-15');
  });

  it('falls back to today when no active days remain', () => {
    expect(firstActiveDay([], '2026-06-12')).toBe('2026-06-12');
  });
});
