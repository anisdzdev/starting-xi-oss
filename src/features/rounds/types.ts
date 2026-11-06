/** Client mirror of a `season_rounds` row (see migration 20261014010000_matchdays.sql). */
export type Round = {
  seasonId: string;
  /** 'md1'…'md8' in the league/group phase, else the stage ('playoff', 'r16', …). */
  key: string;
  /** Human label, e.g. "Matchday 3", "Round of 16". */
  label: string;
  stage: string;
  matchday: number | null;
  /** Inclusive game-day range, YYYY-MM-DD. */
  startsOn: string;
  endsOn: string;
};
