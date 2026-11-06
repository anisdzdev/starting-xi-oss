import { describe, expect, it } from 'vitest';

import { defaultDayFor, pickActiveSeason, seasonOfDay } from './seasonOf';
import type { Season } from './types';

const wc: Season = {
  id: 'wc2026',
  name: 'World Cup 2026',
  shortName: 'WC 2026',
  kind: 'nation',
  fotmobLeagueId: 77,
  startsOn: '2026-06-11',
  endsOn: '2026-07-19',
  status: 'archived',
  hasTournamentPicks: true,
};

const ucl: Season = {
  id: 'ucl2026',
  name: 'Champions League 2026/27',
  shortName: 'UCL 26/27',
  kind: 'club',
  fotmobLeagueId: 42,
  startsOn: '2026-09-08',
  endsOn: '2027-06-30',
  status: 'active',
  hasTournamentPicks: false,
};

const next: Season = { ...ucl, id: 'ucl2027', startsOn: '2027-09-07', endsOn: '2028-06-30', status: 'upcoming' };

describe('pickActiveSeason', () => {
  it('returns the active season even when a newer upcoming one exists', () => {
    expect(pickActiveSeason([next, ucl, wc])?.id).toBe('ucl2026');
  });

  it('falls back to the newest season when none is active', () => {
    expect(pickActiveSeason([wc, { ...next, status: 'archived' }])?.id).toBe('ucl2027');
  });

  it('returns null for an empty list', () => {
    expect(pickActiveSeason([])).toBeNull();
  });
});

describe('seasonOfDay', () => {
  it('finds the season whose range contains the day', () => {
    expect(seasonOfDay([ucl, wc], '2026-06-15')?.id).toBe('wc2026');
    expect(seasonOfDay([ucl, wc], '2026-10-21')?.id).toBe('ucl2026');
  });

  it('returns null in the gap between seasons', () => {
    expect(seasonOfDay([ucl, wc], '2026-08-01')).toBeNull();
  });
});

describe('defaultDayFor', () => {
  it('is today while the season is running', () => {
    expect(defaultDayFor(ucl, '2026-10-21')).toBe('2026-10-21');
  });

  it('is the last day of an archived season', () => {
    expect(defaultDayFor(wc, '2026-10-21')).toBe('2026-07-19');
  });

  it('is the first day of a season that has not started', () => {
    expect(defaultDayFor(next, '2026-10-21')).toBe('2027-09-07');
  });
});
