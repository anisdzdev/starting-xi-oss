// poll-live — refreshes live/recently-finished fixtures from FotMob.
//
// Runs every 2 minutes via pg_cron, but exits immediately (one cheap indexed
// query, zero FotMob calls) unless some fixture is inside the active window:
//   kickoff − 5min  …  kickoff + 3.5h
// (3.5h ≈ fulltime + 30min even for knockout games with extra time + pens;
// the +30min tail catches FotMob's post-match rating settles.)
//
// For each active fixture: fetch matchDetails, parse per-player stats, compute
// fpl_points with the shared scoring module, upsert player_match_stats, and
// update fixture status/score.
//
// Auth: service role key only. Idempotent: upserts on (player_id, fixture_id).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { basePoints, computeBonus, type Position } from '../_shared/scoring.ts';
import { isServiceRole } from '../_shared/auth.ts';
import { heartbeat, logInvocation } from '../_shared/usage.ts';
import {
  liveClockOf,
  liveMinuteOf,
  mapStatus,
  parseCoachCards,
  parseCoaches,
  parseMotm,
  parsePlayers,
} from './parse.ts';

const FOTMOB = 'https://www.fotmob.com/api/data';
const WINDOW_BEFORE_MS = 5 * 60_000; // kickoff − 5min
const WINDOW_AFTER_MS = 3.5 * 3_600_000; // ≈ fulltime + 30min, ET/pens included

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

// Stats parsing (mapStatus / parsePlayers / liveMinuteOf) lives in ./parse.ts
// so it can be unit-tested against real captured FotMob responses.

/** Fetch with retry + exponential backoff (FotMob hiccups shouldn't kill a poll). */
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
    await sleep(700 * 2 ** i); // 0.7s, 1.4s
  }
  throw lastErr;
}

async function pollFixture(fixture: Record<string, any>) {
  const md = (await fetchJson(
    `${FOTMOB}/matchDetails?matchId=${fixture.fotmob_id}`
  )) as Record<string, any>;

  // header.teams is [home, away]
  const teams = md?.header?.teams ?? [];
  const status = mapStatus(md?.header?.status);
  const { error: fxErr } = await supabase
    .from('fixtures')
    .update({
      status,
      home_score: typeof teams[0]?.score === 'number' ? teams[0].score : null,
      away_score: typeof teams[1]?.score === 'number' ? teams[1].score : null,
      // real match clock for the Live Activity (null unless in play)
      live_minute: status === 'live' ? liveClockOf(md?.header?.status) : null,
      // Man of the Match (FotMob player id) for coach-of-the-day scoring; null pre-FT
      motm_player_id: parseMotm(md?.content ?? {}),
    })
    .eq('id', fixture.id);
  if (fxErr) throw new Error(`fixture update: ${fxErr.message}`);

  // postponed/abandoned/cancelled: VOID any scores already banked for this
  // fixture — leaderboards and clean-sheet logic must not count a dead match
  if (status === 'postponed' || status === 'cancelled') {
    const { error: voidErr } = await supabase
      .from('player_match_stats')
      .delete()
      .eq('fixture_id', fixture.id);
    if (voidErr) throw new Error(`void stats: ${voidErr.message}`);
    return { fixture: fixture.fotmob_id, status, players: 0, voided: true };
  }

  const concededByTeamId = new Map<number, number>([
    [Number(teams[0]?.id), Number(teams[1]?.score ?? 0)],
    [Number(teams[1]?.id), Number(teams[0]?.score ?? 0)],
  ]);
  // FotMob withholds per-player "Minutes played" until full time; during live
  // play we approximate it from the match clock so on-pitch players score now.
  const liveMinutes = status === 'live' ? liveMinuteOf(md?.header?.status) : null;
  const parsed = parsePlayers(md?.content ?? {}, concededByTeamId, liveMinutes);
  if (parsed.size === 0) return { fixture: fixture.fotmob_id, status, players: 0 };

  // FotMob id → internal {id, position}, scoped to the fixture's SEASON (a
  // person has one players row per season); players not in our DB are skipped.
  const { data: known, error: selErr } = await supabase
    .from('players')
    .select('id, fotmob_id, position')
    .eq('season_id', fixture.season_id)
    .in('fotmob_id', [...parsed.keys()]);
  if (selErr) throw new Error(`players select: ${selErr.message}`);

  const candidates = known!.map((pl) => ({
    playerId: Number(pl.id),
    rating: parsed.get(Number(pl.fotmob_id))!.rating,
    minutes: parsed.get(Number(pl.fotmob_id))!.stats.minutes,
  }));
  const bonusById = computeBonus(candidates);

  const rows = known!.map((pl) => {
    const { stats, rating, isSub } = parsed.get(Number(pl.fotmob_id))!;
    const bonus = bonusById.get(Number(pl.id)) ?? 0;
    return {
      player_id: Number(pl.id),
      fixture_id: fixture.id,
      minutes: stats.minutes,
      goals: stats.goals,
      assists: stats.assists,
      clean_sheet: stats.cleanSheet,
      saves: stats.saves,
      pen_saves: stats.penSaves,
      pen_misses: stats.penMisses,
      yellows: stats.yellows,
      reds: stats.reds,
      own_goals: stats.ownGoals,
      goals_conceded: stats.goalsConceded,
      rating,
      bonus,
      is_sub: isSub,
      fpl_points: basePoints(pl.position as Position, stats) + bonus,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from('player_match_stats')
      .upsert(rows, { onConflict: 'player_id,fixture_id' });
    if (error) throw new Error(`stats upsert: ${error.message}`);
  }

  // ---- Coach of the day: keep the two managers fresh and persist their cards.
  const homeTeamId = Number(teams[0]?.id);
  const awayTeamId = Number(teams[1]?.id);
  const teamByFotmob = new Map<number, number>(); // fotmob team id → internal team id
  {
    const { data: tms } = await supabase
      .from('teams')
      .select('id, fotmob_id')
      .in('fotmob_id', [homeTeamId, awayTeamId].filter((n) => Number.isFinite(n)));
    for (const t of tms ?? []) teamByFotmob.set(Number(t.fotmob_id), Number(t.id));
  }

  const coaches = parseCoaches(md?.content ?? {});
  const coachRows: Record<string, unknown>[] = [];
  const pushCoach = (c: { id: number; name: string } | null, fotmobTeamId: number) => {
    const teamId = teamByFotmob.get(fotmobTeamId);
    if (!c || teamId == null) return;
    coachRows.push({
      id: c.id,
      name: c.name,
      team_id: teamId,
      image_url: `https://images.fotmob.com/image_resources/playerimages/${c.id}.png`,
    });
  };
  pushCoach(coaches.home, homeTeamId);
  pushCoach(coaches.away, awayTeamId);
  // Best-effort: `coaches.team_id` is UNIQUE (one current coach per team), so a
  // mid-season manager change makes this upsert collide with the sacked coach's
  // row. That must NOT fail the fixture (player stats are already written) nor
  // trip the stale-data heartbeat — log it and carry on; the coach row is fixed by
  // hand (RUNBOOK) until coach history is modelled.
  let coachesOk = true;
  if (coachRows.length > 0) {
    const { error } = await supabase.from('coaches').upsert(coachRows, { onConflict: 'id' });
    if (error) {
      coachesOk = false;
      console.error(`coaches upsert (fixture ${fixture.fotmob_id}): ${error.message}`);
    }
  }

  // Coach cards → coach_match_stats (only for coaches whose team we resolved).
  const cards = parseCoachCards(md?.content ?? {});
  const cardRows: Record<string, unknown>[] = [];
  for (const [coachId, c] of cards) {
    const teamId = c.isHome ? teamByFotmob.get(homeTeamId) : teamByFotmob.get(awayTeamId);
    if (teamId == null) continue;
    cardRows.push({
      coach_id: coachId,
      fixture_id: fixture.id,
      team_id: teamId,
      yellows: c.yellows,
      reds: c.reds,
    });
  }
  if (cardRows.length > 0 && coachesOk) {
    const { error } = await supabase
      .from('coach_match_stats')
      .upsert(cardRows, { onConflict: 'coach_id,fixture_id' });
    // best-effort for the same reason as the coaches upsert above
    if (error) console.error(`coach cards upsert (fixture ${fixture.fotmob_id}): ${error.message}`);
  }

  return { fixture: fixture.fotmob_id, status, players: rows.length };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Kick the Live Activity refresh after stats are written. Best-effort and
 * fire-and-forget — a failure here must never break the poll. live-activity-push
 * no-ops cheaply when nothing is live or the APNs key isn't configured.
 */
function triggerLiveActivityPush(): void {
  fetch(`${SUPABASE_URL}/functions/v1/live-activity-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch((e) => console.error('live-activity-push trigger failed:', e));
}

Deno.serve(async (req) => {
  if (!isServiceRole(req, SERVICE_ROLE_KEY)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  logInvocation(supabase, 'poll-live');

  try {
    const now = Date.now();
    const { data: active, error } = await supabase
      .from('fixtures')
      .select('id, fotmob_id, kickoff_utc, status, season_id')
      .in('status', ['scheduled', 'live', 'finished'])
      .gte('kickoff_utc', new Date(now - WINDOW_AFTER_MS).toISOString())
      .lte('kickoff_utc', new Date(now + WINDOW_BEFORE_MS).toISOString());
    if (error) throw new Error(`fixtures select: ${error.message}`);

    // The common case: nothing near kickoff → done, no FotMob traffic at all.
    if (!active || active.length === 0) {
      return json({ ok: true, active: 0, results: [] });
    }

    const results = [];
    for (const fixture of active) {
      try {
        results.push(await pollFixture(fixture));
      } catch (e) {
        results.push({
          fixture: fixture.fotmob_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    // heartbeat for the stale-data banner: ok only if every fixture updated
    const failures = results.filter((r) => 'error' in r).length;
    await heartbeat(supabase, 'poll_live', {
      ok: failures === 0,
      active: active.length,
      failures,
    });
    // refresh Live Activities off the freshly-written stats (best-effort)
    triggerLiveActivityPush();

    console.log('poll-live:', JSON.stringify(results));
    return json({ ok: true, active: active.length, results });
  } catch (e) {
    console.error('poll-live failed:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
