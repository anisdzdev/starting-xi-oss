import { describe, expect, it } from 'vitest';

import { CLUB_CODES, isPlaceholderTeam, teamCode } from './codes.ts';

describe('CLUB_CODES', () => {
  it('maps all 36 league-phase clubs to distinct 3-letter codes', () => {
    const codes = Object.values(CLUB_CODES);
    expect(codes).toHaveLength(36);
    expect(new Set(codes).size).toBe(36);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it('keeps the well-known clubs recognisable', () => {
    expect(CLUB_CODES[8633]).toBe('RMA'); // Real Madrid
    expect(CLUB_CODES[8456]).toBe('MCI'); // Manchester City
    expect(CLUB_CODES[9847]).toBe('PSG'); // Paris Saint-Germain
  });
});

describe('teamCode', () => {
  it('uses the FIFA map for nations', () => {
    expect(teamCode('nation', { fotmobId: 0, name: 'Spain' })).toBe('ESP');
  });

  it('slices unmapped nation names', () => {
    expect(teamCode('nation', { fotmobId: 0, name: 'Brazil' })).toBe('BRA');
  });

  it('uses the club map by FotMob id for clubs', () => {
    expect(teamCode('club', { fotmobId: 9789, name: 'Borussia Dortmund', shortName: 'Dortmund' })).toBe(
      'BVB'
    );
  });

  it('falls back to the first three letters of the short name for unmapped clubs', () => {
    expect(teamCode('club', { fotmobId: 1, name: 'Újpest FC', shortName: 'Újpest' })).toBe('JPE');
    expect(teamCode('club', { fotmobId: 2, name: 'Celtic' })).toBe('CEL');
  });
});

describe('isPlaceholderTeam', () => {
  it('flags bracket placeholders', () => {
    expect(isPlaceholderTeam('2A')).toBe(true);
    expect(isPlaceholderTeam('1F/2C')).toBe(true);
    expect(isPlaceholderTeam('Winner SF 1')).toBe(true);
    expect(isPlaceholderTeam('Loser Match 61')).toBe(true);
  });

  it('keeps real clubs whose names contain a slash', () => {
    // Regression: "Bodø/Glimt" was dropped as a placeholder by the old `/` rule,
    // losing all 8 of its league-phase fixtures from the seed.
    expect(isPlaceholderTeam('Bodø/Glimt')).toBe(false);
    expect(isPlaceholderTeam('Brighton & Hove Albion')).toBe(false);
  });
});
