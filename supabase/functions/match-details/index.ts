// match-details — FotMob lineup + news for one fixture, shaped for the MatchSheet.
//
// POST { "fotmobId": number, "gameDay": "YYYY-MM-DD" }
//   → MatchDetails (see parseMatchDetails.ts)
//
// Auth: any signed-in user (JWT verified); service role also accepted.
// Browser-invoked → must handle CORS (see _shared/cors.ts).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isServiceRole } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logInvocation } from '../_shared/usage.ts';
import { parseMatchDetails } from './parseMatchDetails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const FOTMOB = 'https://www.fotmob.com/api/data';
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.fotmob.com/',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, attempts = 3): Promise<Record<string, any>> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) return await res.json();
      lastErr = new Error(`FotMob ${res.status}`);
      if (res.status === 403 || res.status === 404) break;
    } catch (e) {
      lastErr = e;
    }
    await sleep(500 * 2 ** i);
  }
  throw lastErr;
}

/** Resolve the caller's user id (service role → null userId but allowed). */
async function getCaller(req: Request): Promise<{ allowed: boolean; userId: string | null }> {
  if (isServiceRole(req, SERVICE_ROLE_KEY)) return { allowed: true, userId: null };
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return { allowed: false, userId: null };
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return { allowed: false, userId: null };
  return { allowed: true, userId: data.user.id };
}

/** FotMob ids of the caller's saved XI for gameDay (empty when none / service role). */
async function myFotmobIds(userId: string | null, gameDay: string): Promise<Set<number>> {
  if (!userId) return new Set();
  const { data } = await admin
    .from('rosters')
    .select('roster_players(players(fotmob_id))')
    .eq('user_id', userId)
    .eq('game_day', gameDay)
    .maybeSingle();
  const rps = (data?.roster_players ?? []) as Array<{ players?: { fotmob_id?: number } }>;
  return new Set(rps.map((rp) => Number(rp.players?.fotmob_id)).filter(Number.isFinite));
}

/** All starter FotMob ids in a matchDetails lineup (home + away). */
function lineupFotmobIds(md: Record<string, any>): number[] {
  const lineup = md?.content?.lineup ?? {};
  const starters = [
    ...(lineup.homeTeam?.starters ?? []),
    ...(lineup.awayTeam?.starters ?? []),
  ] as Array<{ id?: number | string }>;
  return starters.map((s) => Number(s.id)).filter(Number.isFinite);
}

/**
 * Fantasy points this game day, keyed by FotMob id, for the given players.
 * Maps FotMob ids → internal player ids → player_day_points. Empty when the
 * match has no stats yet (upcoming) or none of the players are in our DB.
 */
async function pointsByFotmobId(
  fotmobIds: number[],
  gameDay: string,
  seasonId: string | null
): Promise<Map<number, number>> {
  if (fotmobIds.length === 0 || !gameDay) return new Map();
  // A person has one players row per season — scope to the fixture's season so a
  // Champions League lineup never resolves to the World Cup registration.
  let q = admin.from('players').select('id, fotmob_id').in('fotmob_id', fotmobIds);
  if (seasonId) q = q.eq('season_id', seasonId);
  const { data: players } = await q;
  const idToFotmob = new Map<number, number>();
  for (const p of players ?? []) idToFotmob.set(Number(p.id), Number(p.fotmob_id));
  if (idToFotmob.size === 0) return new Map();

  const { data: pts } = await admin
    .from('player_day_points')
    .select('player_id, points')
    .eq('game_day', gameDay)
    .in('player_id', [...idToFotmob.keys()]);

  const out = new Map<number, number>();
  for (const row of pts ?? []) {
    const fm = idToFotmob.get(Number(row.player_id));
    if (fm != null && row.points != null) out.set(fm, Number(row.points));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const caller = await getCaller(req);
  if (!caller.allowed) return json({ ok: false, error: 'unauthorized' }, 401);
  logInvocation(admin, 'match-details');

  try {
    const body = await req.json().catch(() => ({}));
    const fotmobId = Number(body.fotmobId);
    if (!Number.isFinite(fotmobId)) return json({ ok: false, error: 'fotmobId required' }, 400);
    const gameDay = typeof body.gameDay === 'string' ? body.gameDay : '';

    const [md, fixtureRow] = await Promise.all([
      fetchJson(`${FOTMOB}/matchDetails?matchId=${fotmobId}`),
      admin.from('fixtures').select('season_id').eq('fotmob_id', fotmobId).maybeSingle(),
    ]);
    const seasonId = fixtureRow.data?.season_id ? String(fixtureRow.data.season_id) : null;
    const [mine, points] = await Promise.all([
      myFotmobIds(caller.userId, gameDay),
      pointsByFotmobId(lineupFotmobIds(md), gameDay, seasonId),
    ]);

    return json({ ok: true, ...parseMatchDetails(md, mine, fotmobId, points) });
  } catch (e) {
    console.error('match-details failed:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
