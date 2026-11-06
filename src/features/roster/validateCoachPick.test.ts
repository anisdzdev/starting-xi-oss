import { describe, expect, it } from 'vitest';
import { validateCoachPick, type PickableCoach } from './validateCoachPick';

const coach = (teamCode: string): PickableCoach => ({
  id: 1,
  name: 'Test',
  teamId: 10,
  teamCode,
  flagUrl: null,
  imageUrl: null,
});

describe('validateCoachPick', () => {
  it('rejects when no coach is selected', () => {
    expect(validateCoachPick(null, new Set())).toBe('Pick a coach.');
  });
  it('passes for a valid coach with no started teams', () => {
    expect(validateCoachPick(coach('FRA'), new Set())).toBeNull();
  });
  it('rejects a coach whose team already kicked off', () => {
    expect(validateCoachPick(coach('FRA'), new Set(['FRA']))).toMatch(/already kicked off/);
  });
  it('passes when a different team has started', () => {
    expect(validateCoachPick(coach('FRA'), new Set(['BRA']))).toBeNull();
  });
});
