/** Client mirror of the `seasons` row (see migration 20261014000000_seasons.sql). */
export type Season = {
  id: string; // 'wc2026', 'ucl2026'
  name: string; // "Champions League 2026/27"
  shortName: string; // "UCL 26/27"
  kind: 'nation' | 'club';
  fotmobLeagueId: number;
  /** Inclusive game-day range, YYYY-MM-DD. Ranges never overlap. */
  startsOn: string;
  endsOn: string;
  status: 'upcoming' | 'active' | 'archived';
  /** Whether the Tournament-picks side game exists for this season. */
  hasTournamentPicks: boolean;
};
