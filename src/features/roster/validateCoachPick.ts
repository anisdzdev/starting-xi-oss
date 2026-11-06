export type PickableCoach = {
  id: number;
  name: string;
  teamId: number;
  teamCode: string;
  flagUrl: string | null;
  imageUrl: string | null;
};

/** Pre-save validation for the daily coach pick. Returns an error message or null.
 *  startedTeamCodes mirrors the server trigger's "team hasn't kicked off" check on
 *  the late-build path; omit/empty on the normal pre-lock path. */
export function validateCoachPick(
  coach: PickableCoach | null,
  startedTeamCodes: Set<string>
): string | null {
  if (!coach) return 'Pick a coach.';
  if (startedTeamCodes.has(coach.teamCode)) {
    return `${coach.name}'s team (${coach.teamCode}) has already kicked off — pick a team that hasn't started.`;
  }
  return null;
}
