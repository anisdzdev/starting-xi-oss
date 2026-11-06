// ingest-fotmob — pulls a season's fixtures + squads from FotMob into Supabase.
//
// Season-driven: the `seasons` table (id, kind nation|club, fotmob_league_id,
// status) is the source of truth — no league id env var.
//
// Modes (POST JSON body):
//   { "mode": "seed", "season": "ucl2026" } → every fixture of that season's
//                                             FotMob league + every participating
//                                             squad (default season = the active one)
//   { "mode": "daily", "dates": ["YYYYMMDD", ...] }
//                                           → for EVERY non-archived season: fixtures
//                                             on those dates (default: today + tomorrow
//                                             in ET) + squads of the teams playing
//
// Auth: requires the service role key as Bearer token (called by pg_cron / ops only).
// All upserts are idempotent: teams on fotmob_id, fixtures on fotmob_id, players on
// (fotmob_id, season_id) — a person is one row PER SEASON (France in wc2026, Real
// Madrid in ucl2026).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isServiceRole } from '../_shared/auth.ts';
import { currentGameDay, gameDayOf, GAME_DAY_TZ, toYYYYMMDD } from '../_shared/gameday.ts';
import { logInvocation } from '../_shared/usage.ts';
import { isPlaceholderTeam, teamCode, type SeasonKind, type TeamRef } from './codes.ts';
import { inferStage, parseMatchday } from './stage.ts';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
type Season = { id: string; kind: SeasonKind; fotmob_league_id: number; status: string };

// NOTE: FotMob moved its public JSON from /api/* to /api/data/* (old path returns
// an HTML 404). Verified working 2026-06-11 (WC) and 2026-10-14 (CL, league 42).
const FOTMOB = 'https://www.fotmob.com/api/data';
const TZ = GAME_DAY_TZ;
const SQUAD_FETCH_DELAY_MS = 350; // be polite when walking 36–48 squads

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.fotmob.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) return await res.json();
      lastErr = new Error(`FotMob ${res.status} for ${url}`);
      if (res.status === 403 || res.status === 404) break; // retrying won't help
    } catch (e) {
      lastErr = e;
    }
    await sleep(500 * (i + 1));
  }
  throw lastErr;
}

function mapStatus(s: Record<string, unknown> | undefined): string {
  if (!s) return 'scheduled';
  if (s.cancelled) return 'cancelled';
  const reason = String((s.reason as Record<string, unknown> | undefined)?.longKey ?? '');
  if (reason.includes('postponed')) return 'postponed';
  if (s.finished) return 'finished';
  if (s.started) return 'live';
  return 'scheduled';
}

function parseScores(match: Record<string, any>): { home: number | null; away: number | null } {
  if (typeof match.home?.score === 'number') {
    return { home: match.home.score, away: match.away?.score ?? null };
  }
  const str = match.status?.scoreStr;
  const m = typeof str === 'string' ? str.match(/(\d+)\s*-\s*(\d+)/) : null;
  return m ? { home: Number(m[1]), away: Number(m[2]) } : { home: null, away: null };
}

function mapPosition(positionId: number | undefined, groupTitle: string): Position | null {
  if (positionId === 0) return 'GK';
  if (positionId === 1) return 'DEF';
  if (positionId === 2) return 'MID';
  if (positionId === 3) return 'FWD';
  const t = groupTitle.toLowerCase();
  if (t.includes('keeper')) return 'GK';
  if (t.includes('defend')) return 'DEF';
  if (t.includes('midfield')) return 'MID';
  if (t.includes('attack') || t.includes('forward')) return 'FWD';
  return null; // coaches and other staff
}

// ============================================================ seasons

async function loadSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, kind, fotmob_league_id, status')
    .order('starts_on', { ascending: false });
  if (error) throw new Error(`seasons select: ${error.message}`);
  return (data ?? []).map((s) => ({
    id: String(s.id),
    kind: s.kind as SeasonKind,
    fotmob_league_id: Number(s.fotmob_league_id),
    status: String(s.status),
  }));
}

// ============================================================ upserts

/** Upsert teams, return fotmob_id → internal id map. */
async function upsertTeams(kind: SeasonKind, teams: TeamRef[]): Promise<Map<number, number>> {
  const unique = [...new Map(teams.map((t) => [t.fotmobId, t])).values()];
  if (unique.length === 0) return new Map();

  const rows = unique.map((t) => ({
    fotmob_id: t.fotmobId,
    name: t.name,
    code: teamCode(kind, t),
    flag_url: `https://images.fotmob.com/image_resources/logo/teamlogo/${t.fotmobId}.png`,
  }));
  const { error } = await supabase.from('teams').upsert(rows, { onConflict: 'fotmob_id' });
  if (error) throw new Error(`teams upsert: ${error.message}`);

  const { data, error: selErr } = await supabase
    .from('teams')
    .select('id, fotmob_id')
    .in('fotmob_id', unique.map((t) => t.fotmobId));
  if (selErr) throw new Error(`teams select: ${selErr.message}`);
  return new Map(data!.map((r) => [Number(r.fotmob_id), Number(r.id)]));
}

async function upsertFixtures(
  season: Season,
  matches: Record<string, any>[],
  teamIds: Map<number, number>
): Promise<number> {
  const rows = matches
    .filter(
      (m) =>
        m.status?.utcTime &&
        // skip knockout fixtures whose participants are still bracket placeholders
        teamIds.has(Number(m.home.id)) &&
        teamIds.has(Number(m.away.id))
    )
    .map((m) => {
      const scores = parseScores(m);
      return {
        fotmob_id: Number(m.id),
        season_id: season.id,
        game_day: gameDayOf(m.status.utcTime),
        kickoff_utc: new Date(m.status.utcTime).toISOString(),
        home_team: teamIds.get(Number(m.home.id))!,
        away_team: teamIds.get(Number(m.away.id))!,
        status: mapStatus(m.status),
        home_score: scores.home,
        away_score: scores.away,
        stage: inferStage(m, season.kind),
        matchday: parseMatchday(m), // null outside the league/group phase
      };
    });
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('fixtures').upsert(rows, { onConflict: 'fotmob_id' });
  if (error) throw new Error(`fixtures upsert: ${error.message}`);
  return rows.length;
}

/**
 * Fetch one team's squad and upsert its players for the season. Returns the
 * player count. `players.club` keeps FotMob's `cname`: the club for a nation
 * season, the player's nationality for a club season (the secondary line in
 * the picker either way).
 */
async function ingestSquad(
  season: Season,
  teamFotmobId: number,
  teamInternalId: number
): Promise<number> {
  const data = (await fetchJson(`${FOTMOB}/teams?id=${teamFotmobId}`)) as Record<string, any>;

  // Coach of the day: the team's current manager (best-effort — never fail ingest).
  const coach = data?.overview?.lastLineupStats?.coach;
  if (coach?.id != null) {
    const { error: coachErr } = await supabase.from('coaches').upsert(
      {
        id: Number(coach.id),
        name: String(coach.name ?? ''),
        team_id: teamInternalId,
        image_url: `https://images.fotmob.com/image_resources/playerimages/${Number(coach.id)}.png`,
      },
      { onConflict: 'id' }
    );
    if (coachErr) console.error(`coach upsert (team ${teamFotmobId}): ${coachErr.message}`);
  }

  // FotMob returns { squad: { squad: null } } for some clubs (Shakhtar, Sabah on
  // 2026-10-14) — no squad data at all. Treat as zero players, not an error.
  const raw = data?.squad?.squad ?? data?.squad;
  const groups: Record<string, any>[] = Array.isArray(raw) ? raw : [];

  const rows = groups.flatMap((group) =>
    (group.members ?? [])
      .map((m: Record<string, any>) => {
        const position = mapPosition(m.positionId, String(group.title ?? ''));
        if (!position || !m.id || !m.name) return null;
        return {
          fotmob_id: Number(m.id),
          season_id: season.id,
          team_id: teamInternalId,
          name: String(m.name),
          position,
          image_url: `https://images.fotmob.com/image_resources/playerimages/${m.id}.png`,
          club: m.cname ? String(m.cname) : null,
        };
      })
      .filter(Boolean)
  );
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from('players')
    .upsert(rows, { onConflict: 'fotmob_id,season_id' });
  if (error) throw new Error(`players upsert (team ${teamFotmobId}): ${error.message}`);
  return rows.length;
}

async function ingestSquads(season: Season, teams: TeamRef[], teamIds: Map<number, number>) {
  let players = 0;
  const failures: string[] = [];
  for (const t of teams) {
    try {
      const n = await ingestSquad(season, t.fotmobId, teamIds.get(t.fotmobId)!);
      players += n;
      // Surface clubs FotMob returns no squad for (e.g. squad.squad = null) so
      // someone notices their players can't be picked — not an error, a report.
      if (n === 0) failures.push(`${t.name}: no squad data on FotMob (0 players)`);
    } catch (e) {
      failures.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(SQUAD_FETCH_DELAY_MS);
  }
  return { players, failures };
}

// Placeholder (bracket) teams are filtered by isPlaceholderTeam (codes.ts); their
// fixtures get ingested by the daily run once FotMob swaps in the real team ids.
function teamsFromMatches(matches: Record<string, any>[]): TeamRef[] {
  return matches
    .flatMap((m) =>
      [m.home, m.away].map((t) => ({
        fotmobId: Number(t.id),
        name: String(t.longName ?? t.name),
        shortName: t.shortName ? String(t.shortName) : undefined,
      }))
    )
    .filter((t) => !isPlaceholderTeam(t.name));
}

/** Shared tail of both modes: teams → fixtures → squads for one season. */
async function ingestSeasonMatches(season: Season, matches: Record<string, any>[]) {
  const teams = teamsFromMatches(matches);
  const teamIds = await upsertTeams(season.kind, teams);
  const fixtures = await upsertFixtures(season, matches, teamIds);
  const unique = [...new Map(teams.map((t) => [t.fotmobId, t])).values()];
  const { players, failures } = await ingestSquads(season, unique, teamIds);
  return { season: season.id, teams: teamIds.size, fixtures, players, squadFailures: failures };
}

// ============================================================ modes

/** Whole season: every fixture of the FotMob league + all squads. */
async function seed(seasons: Season[], seasonId: string | undefined) {
  const season = seasonId
    ? seasons.find((s) => s.id === seasonId)
    : seasons.find((s) => s.status === 'active');
  if (!season) throw new Error(`seed: unknown season "${seasonId ?? '(active)'}"`);

  const league = (await fetchJson(
    `${FOTMOB}/leagues?id=${season.fotmob_league_id}&tab=matches&type=league&timeZone=${encodeURIComponent(TZ)}`
  )) as Record<string, any>;
  const matches: Record<string, any>[] = league?.fixtures?.allMatches ?? [];
  if (matches.length === 0) throw new Error('seed: league endpoint returned no matches');

  return ingestSeasonMatches(season, matches);
}

/** Fixtures for specific YYYYMMDD dates + squads of the teams playing, per live season. */
async function daily(seasons: Season[], dates: string[]) {
  const live = seasons.filter((s) => s.status !== 'archived');
  const byDate: Record<string, any>[] = [];
  for (const date of dates) {
    byDate.push(
      await fetchJson(`${FOTMOB}/matches?date=${date}&timezone=${encodeURIComponent(TZ)}`)
    );
  }

  const results = [];
  for (const season of live) {
    const matches = byDate.flatMap((data) =>
      (data?.leagues ?? [])
        .filter(
          (l: Record<string, any>) =>
            l.primaryId === season.fotmob_league_id || l.id === season.fotmob_league_id
        )
        .flatMap((l: Record<string, any>) => l.matches ?? [])
    );
    results.push(await ingestSeasonMatches(season, matches));
  }
  return { dates, seasons: results };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Service-role only: an anon JWT passes the platform's verify_jwt, so check the role.
  if (!isServiceRole(req, SERVICE_ROLE_KEY)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  logInvocation(supabase, 'ingest-fotmob');

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode === 'seed' ? 'seed' : 'daily';

  try {
    const seasons = await loadSeasons();
    const summary =
      mode === 'seed'
        ? await seed(seasons, typeof body.season === 'string' ? body.season : undefined)
        : await daily(
            seasons,
            Array.isArray(body.dates) && body.dates.length > 0
              ? body.dates.map(String)
              : [toYYYYMMDD(currentGameDay(0)), toYYYYMMDD(currentGameDay(1))]
          );
    console.log(`ingest-fotmob ${mode}:`, JSON.stringify(summary));
    return json({ ok: true, mode, ...summary });
  } catch (e) {
    console.error(`ingest-fotmob ${mode} failed:`, e);
    return json({ ok: false, mode, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
