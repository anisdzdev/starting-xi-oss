// Pure team-code helpers for ingest-fotmob — no Deno globals, unit-tested in
// codes.test.ts. FotMob team objects carry no 3-letter codes, so we map them.

export type SeasonKind = 'nation' | 'club';

export type TeamRef = { fotmobId: number; name: string; shortName?: string };

// Nations: FIFA codes where a naive 3-letter slice would be wrong.
export const FIFA_CODES: Record<string, string> = {
  Spain: 'ESP',
  Germany: 'GER',
  Netherlands: 'NED',
  Switzerland: 'SUI',
  Austria: 'AUT',
  Denmark: 'DEN',
  Croatia: 'CRO',
  Japan: 'JPN',
  'South Korea': 'KOR',
  'Korea Republic': 'KOR',
  'Saudi Arabia': 'KSA',
  'United States': 'USA',
  USA: 'USA',
  'South Africa': 'RSA',
  Portugal: 'POR',
  Paraguay: 'PAR',
  Uruguay: 'URU',
  'New Zealand': 'NZL',
  'Cape Verde': 'CPV',
  'Ivory Coast': 'CIV',
  "Cote d'Ivoire": 'CIV',
  Curacao: 'CUW',
  'Curaçao': 'CUW',
  Morocco: 'MAR',
  Nigeria: 'NGA',
  Iran: 'IRN',
};

// Clubs: keyed by FotMob team id (names vary between endpoints — "Manchester
// City" vs "Man City"). The 36 Champions League 2026/27 league-phase clubs,
// verified against the league endpoint on 2026-10-14. Codes are distinct
// (codes.test.ts) so validateRoster's per-day team-code sets can't collide.
export const CLUB_CODES: Record<number, string> = {
  8563: 'AEK', // AEK Athens
  9825: 'ARS', // Arsenal
  10252: 'AVL', // Aston Villa
  9906: 'ATM', // Atlético Madrid
  8634: 'BAR', // Barcelona
  9823: 'BAY', // Bayern München
  8402: 'BOD', // Bodø/Glimt
  9789: 'BVB', // Borussia Dortmund
  8342: 'CLB', // Club Brugge
  10171: 'COM', // Como
  9773: 'FCP', // FC Porto
  8695: 'FEN', // Fenerbahçe
  10235: 'FEY', // Feyenoord
  8637: 'GAL', // Galatasaray
  8636: 'INT', // Inter
  9977: 'LSK', // LASK
  8588: 'RCL', // Lens
  8639: 'LIL', // Lille
  8650: 'LIV', // Liverpool
  8456: 'MCI', // Manchester City
  10260: 'MUN', // Manchester United
  9875: 'NAP', // Napoli
  8640: 'PSV', // PSV Eindhoven
  9847: 'PSG', // Paris Saint-Germain
  178475: 'RBL', // RB Leipzig
  8603: 'BET', // Real Betis
  8633: 'RMA', // Real Madrid
  8686: 'ROM', // Roma
  951893: 'SAB', // Sabah FK
  9728: 'SHK', // Shakhtar Donetsk
  7787: 'SLP', // Slavia Prague
  6019: 'SLB', // Slovan Bratislava
  9768: 'SCP', // Sporting CP
  10269: 'STU', // VfB Stuttgart
  8478: 'VIK', // Viking
  10205: 'VIL', // Villarreal
};

/** First three ASCII letters of a name, upper-cased (accented letters dropped). */
function slice3(name: string): string {
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

/** 3-letter display code for a team, by season kind. */
export function teamCode(kind: SeasonKind, team: TeamRef): string {
  if (kind === 'club') return CLUB_CODES[team.fotmobId] ?? slice3(team.shortName ?? team.name);
  return FIFA_CODES[team.name] ?? slice3(team.name);
}

/**
 * Knockout fixtures reference bracket placeholders ("2A", "1F/2C", "Winner SF 1")
 * until the matchup is decided — those must never become teams. Only a leading
 * digit or Winner/Loser marks a placeholder: a bare slash does NOT ("Bodø/Glimt"
 * is a real club — the old `/` rule dropped its 8 league-phase fixtures).
 */
export function isPlaceholderTeam(name: string): boolean {
  return /^\d/.test(name) || /^(winner|loser)\b/i.test(name);
}
