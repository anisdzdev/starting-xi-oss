import { describe, expect, it } from 'vitest';

import { inferStage, parseMatchday } from './stage.ts';

describe('inferStage — club seasons (Champions League)', () => {
  // Shapes verified against the real FotMob payloads on 2026-10-14:
  // league endpoint allMatches use round/roundName; by-date matches use tournamentStage.
  it('numeric league-phase rounds are the league stage', () => {
    expect(inferStage({ round: '3', roundName: 3 }, 'club')).toBe('league');
    expect(inferStage({ round: '8', roundName: 8 }, 'club')).toBe('league');
  });

  it('by-date matches carry tournamentStage instead of round', () => {
    expect(inferStage({ tournamentStage: '3' }, 'club')).toBe('league');
  });

  it('maps the knockout round strings', () => {
    expect(inferStage({ round: 'playoff', roundName: 'playoff' }, 'club')).toBe('playoff');
    expect(inferStage({ round: '1/8', roundName: 'Round of 16' }, 'club')).toBe('r16');
    expect(inferStage({ round: '1/4', roundName: 'Quarter-Finals' }, 'club')).toBe('qf');
    expect(inferStage({ round: '1/2', roundName: 'Semi-Finals' }, 'club')).toBe('sf');
    expect(inferStage({ round: 'final', roundName: 'Final' }, 'club')).toBe('final');
  });

  it('falls back to league when nothing is recognisable', () => {
    expect(inferStage({}, 'club')).toBe('league');
  });
});

describe('inferStage — nation seasons (World Cup)', () => {
  it('group matches', () => {
    expect(inferStage({ round: '2', group: 'A' }, 'nation')).toBe('group');
  });

  it('knockout rounds including the round of 32 and third place', () => {
    expect(inferStage({ roundName: '1/16' }, 'nation')).toBe('r32');
    expect(inferStage({ roundName: 'Third place' }, 'nation')).toBe('third');
    expect(inferStage({ roundName: 'Final' }, 'nation')).toBe('final');
  });

  it('falls back to the WC2026 calendar when round fields are missing', () => {
    expect(inferStage({ status: { utcTime: '2026-06-20T20:00:00Z' } }, 'nation')).toBe('group');
    expect(inferStage({ status: { utcTime: '2026-07-19T19:00:00Z' } }, 'nation')).toBe('final');
  });
});

describe('parseMatchday', () => {
  it('reads the numeric league-phase round from either payload shape', () => {
    expect(parseMatchday({ round: '3', roundName: 3 })).toBe(3);
    expect(parseMatchday({ tournamentStage: '5' })).toBe(5);
  });

  it('is null for knockout rounds and missing fields', () => {
    expect(parseMatchday({ round: 'playoff' })).toBeNull();
    expect(parseMatchday({ round: '1/8', roundName: 'Round of 16' })).toBeNull();
    expect(parseMatchday({})).toBeNull();
  });
});

describe('parseMatchday bounds', () => {
  it('accepts long league calendars but rejects nonsense so one row cannot fail the batch upsert', () => {
    expect(parseMatchday({ round: '38' })).toBe(38); // a 20-team league season
    expect(parseMatchday({ round: '0' })).toBeNull();
    expect(parseMatchday({ round: '999' })).toBeNull();
  });
});
