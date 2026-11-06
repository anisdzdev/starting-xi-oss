import { describe, expect, it } from 'vitest';

import { roundLabel, roundOfDay, stepRound } from './roundLabel';
import type { Round } from './types';

const r = (key: string, startsOn: string, endsOn: string): Round => ({
  seasonId: 'ucl2026',
  key,
  label: roundLabel(key),
  stage: key.startsWith('md') ? 'league' : key,
  matchday: key.startsWith('md') ? Number(key.slice(2)) : null,
  startsOn,
  endsOn,
});

// ascending by start, as loadRounds returns them
const rounds = [
  r('md2', '2026-09-29', '2026-09-30'),
  r('md3', '2026-10-20', '2026-10-21'),
  r('md4', '2026-11-03', '2026-11-04'),
  r('playoff', '2027-02-16', '2027-02-24'),
];

describe('roundLabel', () => {
  it('names league matchdays and knockout stages', () => {
    expect(roundLabel('md3')).toBe('Matchday 3');
    expect(roundLabel('playoff')).toBe('Play-off');
    expect(roundLabel('r16')).toBe('Round of 16');
    expect(roundLabel('qf')).toBe('Quarter-finals');
    expect(roundLabel('sf')).toBe('Semi-finals');
    expect(roundLabel('final')).toBe('Final');
    expect(roundLabel('group')).toBe('Group stage');
    expect(roundLabel('r32')).toBe('Round of 32');
    expect(roundLabel('third')).toBe('Third place');
  });

  it('falls back to the raw key for anything unknown', () => {
    expect(roundLabel('weird')).toBe('weird');
  });
});

describe('roundOfDay', () => {
  it('finds the round whose range contains the day', () => {
    expect(roundOfDay(rounds, '2026-10-21')?.key).toBe('md3');
  });

  it('is null on a rest day between rounds', () => {
    expect(roundOfDay(rounds, '2026-10-25')).toBeNull();
  });
});

describe('stepRound', () => {
  it('steps to the adjacent round', () => {
    expect(stepRound(rounds, 'md3', 'older')?.key).toBe('md2');
    expect(stepRound(rounds, 'md3', 'newer')?.key).toBe('md4');
  });

  it('is null past the ends of the list', () => {
    expect(stepRound(rounds, 'md2', 'older')).toBeNull();
    expect(stepRound(rounds, 'playoff', 'newer')).toBeNull();
  });

  it('is null for an unknown key', () => {
    expect(stepRound(rounds, 'md9', 'older')).toBeNull();
  });
});
