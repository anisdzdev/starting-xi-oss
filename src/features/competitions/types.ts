export type CompetitionMetric = 'xi' | 'pick';
export type PickKind = 'keeper' | 'player';
export type CompetitionStatus = 'open' | 'live' | 'finished';

/** A competition row joined with its span (competition_spans) and the viewer's membership. */
export type Competition = {
  id: string;
  seasonId: string;
  name: string;
  reward: string | null;
  metric: CompetitionMetric;
  pickKind: PickKind | null;
  fromRound: string;
  toRound: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  /** Inclusive game-day span, YYYY-MM-DD. */
  startsOn: string;
  endsOn: string;
  /** ISO instant of the span's first kickoff — joins/picks/deletes close here. Null = no fixtures yet. */
  firstKickoff: string | null;
  status: CompetitionStatus;
  memberCount: number;
  me: { joined: boolean; pickPlayerId: number | null };
};

/** One row of competition_standings. */
export type CompetitionStanding = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  pickPlayerId: number | null;
  pickName: string | null;
  pickImageUrl: string | null;
  points: number;
  played: number;
  rank: number;
};

export type NewCompetition = {
  seasonId: string;
  name: string;
  reward: string | null;
  metric: CompetitionMetric;
  pickKind: PickKind | null;
  fromRound: string;
  toRound: string;
};
