import { describe, expect, it } from 'vitest';

import { stepDay } from './dayStep';

// Fixture days of a club season: two matchdays a week, rest days in between.
const days = ['2026-10-06', '2026-10-07', '2026-10-21', '2026-10-22'];

describe('stepDay', () => {
  it('steps to the adjacent fixture day when the selected day is a fixture day', () => {
    expect(stepDay(days, '2026-10-21', 'older')).toBe('2026-10-07');
    expect(stepDay(days, '2026-10-21', 'newer')).toBe('2026-10-22');
  });

  it('is null at the ends of the range', () => {
    expect(stepDay(days, '2026-10-06', 'older')).toBeNull();
    expect(stepDay(days, '2026-10-22', 'newer')).toBeNull();
  });

  it('steps from a rest day to the nearest fixture day on either side', () => {
    // A Thursday between matchdays: left = last matchday, right = next one.
    expect(stepDay(days, '2026-10-15', 'older')).toBe('2026-10-07');
    expect(stepDay(days, '2026-10-15', 'newer')).toBe('2026-10-21');
  });

  it('steps from a placeholder day after the last fixture back to the last fixture', () => {
    // An archived season's ends_on may be a date with no fixtures.
    expect(stepDay(days, '2027-06-30', 'older')).toBe('2026-10-22');
    expect(stepDay(days, '2027-06-30', 'newer')).toBeNull();
  });

  it('is null both ways with no fixture days', () => {
    expect(stepDay([], '2026-10-15', 'older')).toBeNull();
    expect(stepDay([], '2026-10-15', 'newer')).toBeNull();
  });
});
