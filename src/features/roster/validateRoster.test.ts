import { describe, expect, it } from 'vitest';

import { validateRoster } from './validateRoster';
import type { PickedPlayer } from './store';

function player(id: number, position: PickedPlayer['position'], teamCode: string): PickedPlayer {
  return { id, name: `P${id}`, position, imageUrl: null, teamCode, flagUrl: null };
}

// 4-3-3 slot order: GK, DEF×4, MID×3, FWD×3
function xi433(): PickedPlayer[] {
  return [
    player(1, 'GK', 'AAA'),
    player(2, 'DEF', 'AAA'),
    player(3, 'DEF', 'AAA'),
    player(4, 'DEF', 'BBB'),
    player(5, 'DEF', 'BBB'),
    player(6, 'MID', 'BBB'),
    player(7, 'MID', 'AAA'),
    player(8, 'MID', 'BBB'),
    player(9, 'FWD', 'AAA'),
    player(10, 'FWD', 'BBB'),
    player(11, 'FWD', 'AAA'),
  ];
}

describe('validateRoster — started-team rule', () => {
  const playing = new Set(['AAA', 'BBB']);

  it('passes a full valid XI when no team has started', () => {
    const slots = xi433();
    expect(validateRoster('4-3-3', slots, 9, playing, new Set())).toBeNull();
  });

  it('rejects an XI containing a player whose team has already kicked off', () => {
    const slots = xi433(); // contains BBB players
    const result = validateRoster('4-3-3', slots, 9, playing, new Set(['BBB']));
    expect(result).toMatch(/already kicked off/i);
  });

  it('ignores the started set when undefined (normal pre-lock path)', () => {
    const slots = xi433();
    expect(validateRoster('4-3-3', slots, 9, playing)).toBeNull();
  });

  it('passes when started teams exist but none are in the XI', () => {
    const slots = xi433(); // only AAA and BBB
    expect(validateRoster('4-3-3', slots, 9, playing, new Set(['CCC']))).toBeNull();
  });
});
