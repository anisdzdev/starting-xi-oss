// Pure FotMob matchDetails → MatchSheet payload. No Deno globals or network, so
// it is unit-tested (parseMatchDetails.test.ts) against real captured responses.
// Mirrors the structure of poll-live/parse.ts.

export type LineupPlayer = {
  id: number;        // FotMob player id
  name: string;      // surname when available, else full name
  shirt: string | null;
  x: number;         // FotMob verticalLayout x (0–1)
  y: number;         // FotMob verticalLayout y (0–1, ~0.1 = near own goal)
  isMine: boolean;   // in the caller's saved XI
  points: number | null; // fantasy points this game day (null = no stats yet)
  goals: number;     // goals scored (from performance events)
  assists: number;   // assists (from performance events)
  cleanSheet: boolean; // finished match, team conceded 0, GK/DEF/MID
  isMotm: boolean;   // Man of the Match
};

export type TeamLineup = {
  formation: string | null;
  players: LineupPlayer[]; // starters only
};

export type NewsItem = {
  id: string;
  title: string;
  image: string | null;
  source: string;
  url: string;
};

export type MatchDetails = {
  lineupType: 'confirmed' | 'predicted' | null;
  home: TeamLineup;
  away: TeamLineup;
  news: NewsItem[];
  fotmobUrl: string;
};

function mapLineupType(raw: unknown): 'confirmed' | 'predicted' | null {
  if (raw === 'standard') return 'confirmed';
  if (raw === 'lastStarting11') return 'predicted';
  return null;
}

/** Count performance events of a given type for one starter. */
function countEvents(s: Record<string, any>, type: string): number {
  const events = (s?.performance?.events ?? []) as Array<{ type?: string }>;
  return events.filter((e) => e?.type === type).length;
}

function parseTeam(
  team: Record<string, any> | undefined,
  mine: Set<number>,
  points: Map<number, number>,
  motmId: number | null,
  conceded: number | null, // goals this team conceded (null = not finished)
): TeamLineup {
  const starters: Record<string, any>[] = team?.starters ?? [];
  const players: LineupPlayer[] = starters.map((s) => {
    const layout = (s.verticalLayout ?? {}) as { x?: number; y?: number };
    const id = Number(s.id);
    // usualPlayingPositionId: 0 GK, 1 DEF, 2 MID, 3 FWD — clean sheet is a
    // defensive reward, so forwards never get the shield.
    const pos = Number(s.usualPlayingPositionId);
    const cleanSheet = conceded === 0 && pos >= 0 && pos <= 2;
    return {
      id,
      name: String(s.lastName || s.name || '').trim(),
      shirt: s.shirtNumber != null ? String(s.shirtNumber) : null,
      x: typeof layout.x === 'number' ? layout.x : 0.5,
      y: typeof layout.y === 'number' ? layout.y : 0.5,
      isMine: mine.has(id),
      points: points.has(id) ? points.get(id)! : null,
      goals: countEvents(s, 'goal'),
      assists: countEvents(s, 'assist'),
      cleanSheet,
      isMotm: motmId != null && id === motmId,
    };
  });
  return { formation: team?.formation ?? null, players };
}

/**
 * English-only, ≤3 news items. FotMob duplicates each article with a localized
 * `_es` id + `lang` field; we keep `lang === 'en'` (or no lang) and drop `_`-suffixed
 * ids. `postReview` for finished matches, else `preReview`.
 */
function parseNews(matchFacts: Record<string, any> | undefined, finished: boolean): NewsItem[] {
  const primary = finished ? matchFacts?.postReview : matchFacts?.preReview;
  const list: Record<string, any>[] = (primary ??
    matchFacts?.preReview ??
    matchFacts?.postReview ??
    []) as Record<string, any>[];
  return list
    .filter((n) => (n.lang ? n.lang === 'en' : true) && !String(n.id ?? '').includes('_'))
    .slice(0, 3)
    .map((n) => ({
      id: String(n.id),
      title: String(n.title ?? ''),
      image: n.image ? String(n.image) : null,
      source: String(n.source ?? 'FotMob'),
      url: String(n.shareUrl ?? n.contentUrl ?? ''),
    }))
    .filter((n) => n.title && /^https?:\/\//.test(n.url));
}

export function parseMatchDetails(
  md: Record<string, any>,
  mine: Set<number>,
  fotmobId: number,
  pointsByFotmobId: Map<number, number> = new Map()
): MatchDetails {
  const content = md?.content ?? {};
  const lineup = content.lineup ?? null;
  const finished = Boolean(md?.general?.finished ?? md?.header?.status?.finished);

  const motmId = Number(content?.matchFacts?.playerOfTheMatch?.id);
  const motm = Number.isFinite(motmId) ? motmId : null;

  // Final scores drive clean sheets (only meaningful once finished).
  const teams = (md?.header?.teams ?? []) as Array<{ score?: number }>;
  const homeScore = finished ? Number(teams[0]?.score) : NaN;
  const awayScore = finished ? Number(teams[1]?.score) : NaN;
  // A team's conceded = the OTHER team's score.
  const homeConceded = Number.isFinite(awayScore) ? awayScore : null;
  const awayConceded = Number.isFinite(homeScore) ? homeScore : null;

  return {
    lineupType: mapLineupType(lineup?.lineupType),
    home: parseTeam(lineup?.homeTeam, mine, pointsByFotmobId, motm, homeConceded),
    away: parseTeam(lineup?.awayTeam, mine, pointsByFotmobId, motm, awayConceded),
    news: parseNews(content.matchFacts, finished),
    fotmobUrl: `https://www.fotmob.com/match/${fotmobId}`,
  };
}
