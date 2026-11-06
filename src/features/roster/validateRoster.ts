import { slotPositionList } from './formations';
import type { PickedPlayer } from './store';

/** Client-side pre-save validation. Returns an error message, or null when valid.
 *
 * @param startedTeamCodes - Optional set of team codes whose matches have already
 *   kicked off. When provided (superuser late-entry path), any picked player whose
 *   team is in this set causes a rejection. Omit on the normal pre-lock path.
 */
export function validateRoster(
  formationCode: string | null,
  slots: (PickedPlayer | null)[],
  captainId: number | null,
  playingTeamCodes: Set<string>,
  startedTeamCodes?: Set<string>
): string | null {
  if (!formationCode) return 'Pick a formation first.';
  const filled = slots.filter(Boolean) as PickedPlayer[];
  if (filled.length !== 11) return `Pick all 11 players (${filled.length}/11).`;

  const positions = slotPositionList(formationCode);
  for (let i = 0; i < 11; i++) {
    if (slots[i] && slots[i]!.position !== positions[i]) {
      return `Slot ${i + 1} needs a ${positions[i]}.`;
    }
  }

  if (!captainId) return 'Choose a captain (tap a player, then the armband).';
  if (!filled.some((p) => p.id === captainId)) return 'Your captain must be in the XI.';

  if (startedTeamCodes && startedTeamCodes.size > 0) {
    const started = filled.find((p) => startedTeamCodes.has(p.teamCode));
    if (started) {
      return `${started.name} (${started.teamCode}) has already kicked off — pick a team that hasn't started.`;
    }
  }

  const ineligible = filled.find((p) => !playingTeamCodes.has(p.teamCode));
  if (ineligible) {
    return `${ineligible.name} (${ineligible.teamCode}) has no match today.`;
  }
  return null;
}
