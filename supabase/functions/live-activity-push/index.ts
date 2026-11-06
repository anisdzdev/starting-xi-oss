// live-activity-push — start/update/end Apple Live Activities for the day's
// live matches. Service-role only (invoked by poll-live after each cycle).
//
// Pipeline: gather today's fixtures + rosters + live stats + tokens + running
// activities → build each user's ContentState (buildActivityState) → decide
// actions (planLiveActivity) → execute (APNs liveactivity pushes + DB
// bookkeeping). The two pure cores are unit-tested; this file is the I/O glue.
//
// No-ops gracefully (no DB churn) when the APNs key isn't provisioned yet
// (Phase 7), so it's safe to wire into poll-live before the .p8 exists.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isServiceRole } from '../_shared/auth.ts';
import { logInvocation } from '../_shared/usage.ts';
import { currentGameDay } from '../_shared/gameday.ts';
import {
  buildActivityState,
  type ActivityFixture,
  type ActivityRosterPlayer,
  type FixtureStatus,
  type Position,
} from '../_shared/buildActivityState.ts';
import { planLiveActivity, type UserActivityInput } from '../_shared/planLiveActivity.ts';
import { buildApnsRequest, makeApnsJwt, type ApnsEvent } from '../_shared/apns.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const APNS = {
  keyId: Deno.env.get('APNS_KEY_ID') ?? '',
  teamId: Deno.env.get('APNS_TEAM_ID') ?? '',
  p8: Deno.env.get('APNS_AUTH_KEY') ?? '',
  topic: Deno.env.get('APNS_TOPIC') ?? 'com.novem.startingxi',
};
const ATTRIBUTES_TYPE = 'StartingXIAttributes';
const STALE_AFTER_MS = 8 * 60_000; // mark the activity stale 8 min after the last push
const DISMISS_AFTER_MS = 5 * 60_000; // remove the ended activity 5 min after the end push

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Assemble each user's ContentState + the activity/token state the planner needs. */
async function gatherUsers(gameDay: string, nowMs: number): Promise<UserActivityInput[]> {
  const [fixturesRes, teamsRes, pointsRes, rostersRes, tokensRes, activitiesRes] =
    await Promise.all([
      supabase
        .from('fixtures')
        .select('id, status, kickoff_utc, home_score, away_score, home_team, away_team, live_minute')
        .eq('game_day', gameDay),
      supabase.from('teams').select('id, code'),
      supabase.from('player_day_points').select('player_id, points').eq('game_day', gameDay),
      supabase
        .from('rosters')
        .select(
          'user_id, captain_player_id, roster_players(player_id, players(id, name, position, team_id))'
        )
        .eq('game_day', gameDay),
      supabase.from('live_activity_push_tokens').select('user_id, push_to_start_token, env, updated_at'),
      supabase
        .from('live_activities')
        .select('id, user_id, push_token, env, ended_pending_since, last_content_state, started_at')
        .eq('state', 'active'),
    ]);

  const teamCode = new Map<number, string>(
    (teamsRes.data ?? []).map((t: any) => [Number(t.id), t.code as string])
  );
  // team_id → the team's fixture today (each team plays at most once per game day)
  const fixtureOfTeam = new Map<number, any>();
  const dayFixtures: ActivityFixture[] = (fixturesRes.data ?? []).map((f: any) => {
    fixtureOfTeam.set(Number(f.home_team), f);
    fixtureOfTeam.set(Number(f.away_team), f);
    return {
      fixtureId: Number(f.id),
      homeCode: teamCode.get(Number(f.home_team)) ?? '???',
      awayCode: teamCode.get(Number(f.away_team)) ?? '???',
      homeScore: f.home_score,
      awayScore: f.away_score,
      status: f.status as FixtureStatus,
      kickoffUtc: f.kickoff_utc as string,
      liveMinute: f.live_minute ?? null,
    };
  });

  const pointsOf = new Map<number, number>(
    (pointsRes.data ?? []).map((p: any) => [Number(p.player_id), Number(p.points)])
  );

  // most-recent push-to-start token per user
  const tokenOf = new Map<string, { token: string; env: 'prod' | 'sandbox' }>();
  for (const t of (tokensRes.data ?? []).sort(
    (a: any, b: any) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
  )) {
    if (!tokenOf.has(t.user_id)) tokenOf.set(t.user_id, { token: t.push_to_start_token, env: t.env });
  }

  const activitiesOf = new Map<string, any[]>();
  for (const a of activitiesRes.data ?? []) {
    const list = activitiesOf.get(a.user_id) ?? [];
    list.push(a);
    activitiesOf.set(a.user_id, list);
  }

  // every user with a roster today OR a running activity / token
  const userIds = new Set<string>([
    ...(rostersRes.data ?? []).map((r: any) => r.user_id),
    ...tokenOf.keys(),
    ...activitiesOf.keys(),
  ]);

  const rosterOf = new Map<string, any>((rostersRes.data ?? []).map((r: any) => [r.user_id, r]));

  return [...userIds].map((userId) => {
    const roster = rosterOf.get(userId);
    const players: ActivityRosterPlayer[] = (roster?.roster_players ?? []).map((rp: any) => {
      const pl = rp.players;
      const fixture = fixtureOfTeam.get(Number(pl.team_id));
      return {
        id: Number(pl.id),
        name: pl.name as string,
        position: pl.position as Position,
        teamCode: teamCode.get(Number(pl.team_id)) ?? '???',
        fixtureId: fixture ? Number(fixture.id) : null,
        points: pointsOf.get(Number(pl.id)) ?? 0,
        isCaptain: Number(pl.id) === Number(roster.captain_player_id),
      };
    });

    const contentState = players.length
      ? buildActivityState({ players, fixtures: dayFixtures, nowMs })
      : null;
    const tok = tokenOf.get(userId);

    return {
      userId,
      env: tok?.env ?? 'prod',
      pushToStartToken: tok?.token ?? null,
      contentState,
      activities: (activitiesOf.get(userId) ?? []).map((a: any) => ({
        id: a.id,
        token: a.push_token,
        endedPendingSince: a.ended_pending_since ? Date.parse(a.ended_pending_since) : null,
        createdAtMs: a.started_at ? Date.parse(a.started_at) : null,
        // carried for the unchanged-push skip + end-push reuse (not used by the planner)
        _env: a.env,
        _lastContentState: a.last_content_state,
      })),
    } as UserActivityInput & { activities: any[] };
  });
}

/** Lock-screen banner shown when a push-to-start activity begins (iOS requires it). */
function startAlert(state: {
  layout: string;
  matches: { homeCode: string; awayCode: string; homeScore: number | null; awayScore: number | null }[];
}): { title: string; body: string } {
  const m = state.matches[0];
  if (state.layout === 'focused' && m) {
    return {
      title: 'Your XI is live',
      body: `${m.homeCode} ${m.homeScore ?? 0}–${m.awayScore ?? 0} ${m.awayCode}`,
    };
  }
  const n = state.matches.length;
  return { title: 'Your XI is live', body: `Tracking ${n} live ${n === 1 ? 'match' : 'matches'}` };
}

async function sendPush(
  jwt: string,
  args: {
    token: string;
    event: ApnsEvent;
    contentState: unknown;
    env: 'prod' | 'sandbox';
    nowSec: number;
    attributes?: Record<string, unknown>;
    attributesType?: string;
    staleSec?: number;
    dismissSec?: number;
    alert?: { title: string; body: string };
  }
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const req = buildApnsRequest(jwt, { ...args, topic: APNS.topic });
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req, SERVICE_ROLE_KEY)) return json({ ok: false, error: 'unauthorized' }, 401);
  logInvocation(supabase, 'live-activity-push');

  if (!APNS.keyId || !APNS.teamId || !APNS.p8) {
    return json({ ok: true, skipped: 'APNs credentials not configured' });
  }

  try {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const gameDay = currentGameDay(0, nowMs);

    const users = (await gatherUsers(gameDay, nowMs)) as (UserActivityInput & {
      activities: any[];
    })[];
    const actions = planLiveActivity({ users, nowMs });
    if (actions.length === 0) return json({ ok: true, gameDay, actions: 0 });

    const jwt = await makeApnsJwt(APNS, nowSec);
    const stateById = new Map<string, any>();
    for (const u of users) for (const a of u.activities) stateById.set(a.id, a);

    const results: Record<string, number> = {};
    const bump = (k: string) => (results[k] = (results[k] ?? 0) + 1);

    for (const a of actions) {
      switch (a.type) {
        case 'start': {
          const r = await sendPush(jwt, {
            token: a.token, event: 'start', contentState: a.contentState, env: a.env, nowSec,
            attributes: { userId: a.userId, gameDay }, attributesType: ATTRIBUTES_TYPE,
            alert: startAlert(a.contentState),
            staleSec: nowSec + Math.floor(STALE_AFTER_MS / 1000),
          });
          if (r.ok) {
            // dedup placeholder — inserted ONLY on success so a failed start retries
            await supabase.from('live_activities').upsert(
              {
                id: `start:${a.userId}:${gameDay}`, user_id: a.userId, game_day: gameDay,
                env: a.env, state: 'active', push_token: null,
                started_at: new Date(nowMs).toISOString(), last_pushed_at: new Date(nowMs).toISOString(),
              },
              { onConflict: 'id' }
            );
          } else {
            console.error('start push failed', a.userId, r.status, r.error);
          }
          bump(r.ok ? 'start' : 'start_failed');
          break;
        }
        case 'update': {
          const prev = stateById.get(a.activityId)?._lastContentState;
          const next = JSON.stringify(a.contentState);
          if (prev && JSON.stringify(prev) === next) {
            bump('update_skipped');
            break;
          }
          const r = await sendPush(jwt, {
            token: a.token, event: 'update', contentState: a.contentState, env: a.env, nowSec,
            staleSec: nowSec + Math.floor(STALE_AFTER_MS / 1000),
          });
          if (r.ok) {
            await supabase
              .from('live_activities')
              .update({
                last_content_state: a.contentState, last_pushed_at: new Date(nowMs).toISOString(),
                stale_date: new Date(nowMs + STALE_AFTER_MS).toISOString(),
              })
              .eq('id', a.activityId);
          } else {
            console.error('update push failed', a.activityId, r.status, r.error);
          }
          bump(r.ok ? 'update' : 'update_failed');
          break;
        }
        case 'mark-end-pending': {
          await supabase
            .from('live_activities')
            .update({ ended_pending_since: new Date(a.sinceMs).toISOString() })
            .eq('id', a.activityId);
          bump('mark_end_pending');
          break;
        }
        case 'clear-end-pending': {
          await supabase
            .from('live_activities')
            .update({ ended_pending_since: null })
            .eq('id', a.activityId);
          bump('clear_end_pending');
          break;
        }
        case 'end': {
          const finalState = a.contentState ?? stateById.get(a.activityId)?._lastContentState ?? {};
          const r = await sendPush(jwt, {
            token: a.token, event: 'end', contentState: finalState, env: a.env, nowSec,
            dismissSec: nowSec + Math.floor(DISMISS_AFTER_MS / 1000),
          });
          await supabase.from('live_activities').update({ state: 'ended' }).eq('id', a.activityId);
          bump(r.ok ? 'end' : 'end_failed');
          if (!r.ok) console.error('end push failed', a.activityId, r.status, r.error);
          break;
        }
        case 'drop-placeholder': {
          await supabase.from('live_activities').delete().eq('id', a.activityId);
          bump('drop_placeholder');
          break;
        }
      }
    }

    console.log('live-activity-push:', JSON.stringify({ gameDay, ...results }));
    return json({ ok: true, gameDay, ...results });
  } catch (e) {
    console.error('live-activity-push failed:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
