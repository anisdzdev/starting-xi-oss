import { describe, expect, it } from 'vitest';

import type { Round } from '../rounds/types';

import { goalLabel, isLocked, knockoutSpan, seasonSpan, spanLabel } from './goal';
import type { Competition } from './types';

const r = (key: string, startsOn: string, endsOn: string): Round => ({
  seasonId: 'ucl2026',
  key,
  label: key.startsWith('md') ? `Matchday ${key.slice(2)}` : key,
  stage: key.startsWith('md') ? 'league' : key,
  matchday: key.startsWith('md') ? Number(key.slice(2)) : null,
  startsOn,
  endsOn,
});

const rounds = [
  r('md1', '2026-09-08', '2026-09-10'),
  r('md2', '2026-10-13', '2026-10-14'),
  r('md3', '2026-10-20', '2026-10-21'),
  r('playoff', '2027-02-16', '2027-02-24'),
  r('r16', '2027-03-09', '2027-03-17'),
  r('final', '2027-05-29', '2027-05-29'),
];

const base: Competition = {
  id: 'c1',
  seasonId: 'ucl2026',
  name: 'Best of MD3',
  reward: 'Loser buys dinner',
  metric: 'xi',
  pickKind: null,
  fromRound: 'md3',
  toRound: 'md3',
  createdBy: 'u1',
  creatorName: 'Anis',
  createdAt: '2026-10-14T10:00:00Z',
  startsOn: '2026-10-20',
  endsOn: '2026-10-21',
  firstKickoff: '2026-10-20T16:45:00Z',
  status: 'open',
  memberCount: 3,
  me: { joined: false, pickPlayerId: null },
};

describe('spanLabel', () => {
  it('names a single round', () => {
    expect(spanLabel(rounds, 'md3', 'md3')).toBe('Matchday 3');
  });
  it('names a range of matchdays', () => {
    expect(spanLabel(rounds, 'md1', 'md3')).toBe('Matchday 1 – 3');
  });
  it('calls every non-matchday round the knockouts', () => {
    expect(spanLabel(rounds, 'playoff', 'final')).toBe('Knockouts');
  });
  it('calls every round the whole season', () => {
    expect(spanLabel(rounds, 'md1', 'final')).toBe('Whole season');
  });
  it('joins mixed spans with their labels', () => {
    expect(spanLabel(rounds, 'md3', 'r16')).toBe('Matchday 3 – Round of 16');
  });
  it('still labels a span whose rounds are not loaded', () => {
    expect(spanLabel([], 'md9', 'md9')).toBe('Matchday 9');
    expect(spanLabel([], 'md1', 'md3')).toBe('Matchday 1 – Matchday 3');
  });
});

describe('goalLabel', () => {
  it('describes an XI-points goal', () => {
    expect(goalLabel(base, rounds)).toBe('Best XI · Matchday 3');
  });
  it('describes pick goals by kind', () => {
    expect(goalLabel({ ...base, metric: 'pick', pickKind: 'keeper' }, rounds)).toBe(
      'Best keeper pick · Matchday 3'
    );
    expect(
      goalLabel({ ...base, metric: 'pick', pickKind: 'player', fromRound: 'playoff', toRound: 'final' }, rounds)
    ).toBe('Best player pick · Knockouts');
  });
});

describe('span presets', () => {
  it('knockoutSpan covers the first to last non-matchday round', () => {
    expect(knockoutSpan(rounds)).toEqual({ from: 'playoff', to: 'final' });
  });
  it('knockoutSpan is null before any knockout fixtures exist', () => {
    expect(knockoutSpan(rounds.slice(0, 3))).toBeNull();
  });
  it('seasonSpan covers everything and is null with no rounds', () => {
    expect(seasonSpan(rounds)).toEqual({ from: 'md1', to: 'final' });
    expect(seasonSpan([])).toBeNull();
  });
});

describe('isLocked', () => {
  it('locks at the first kickoff', () => {
    expect(isLocked('2026-10-20T16:45:00Z', Date.parse('2026-10-20T16:44:59Z'))).toBe(false);
    expect(isLocked('2026-10-20T16:45:00Z', Date.parse('2026-10-20T16:45:00Z'))).toBe(true);
  });
  it('treats a missing kickoff (no fixtures yet) as locked', () => {
    expect(isLocked(null, Date.now())).toBe(true);
  });
});
