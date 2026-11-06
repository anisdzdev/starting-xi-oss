// send-push — delivers notifications via Expo Push (native) and Web Push (PWA).
//
// Modes (POST JSON body):
//   { "kind": "nudge", "to_user": "<uuid>" }
//       Caller: signed-in user. Verifies a nudges row exists for
//       (caller → to_user, today) — the app inserts it first (unique index =
//       the rate limit) — then pushes "<name> nudged you — first kickoff in 2h 14m".
//   { "kind": "chat", "message_id": <number> }
//       Caller: signed-in user. Verifies the message is theirs and recent, then
//       respects each recipient's chat_notifications preference (except sender):
//         'all'      → "<name>: <preview>"
//         'mentions' → only if @-mentioned OR replied-to
//       A "direct" recipient (the user this message replies to, or an @-mentioned
//       user) gets a personalized push on 'all' OR 'mentions'; a reply-to beats a
//       mention beats the plain broadcast, so each recipient gets exactly one push:
//         replied-to → "<name> replied to you" / <preview>
//         mentioned  → "<name> mentioned you"  / <preview>
//         plain      → "<name>" / <preview>   (only 'all')
//         'none'     → nothing
//       Best-effort; fired by the app right after inserting the message.
//   { "kind": "competition", "competition_id": "<uuid>" }
//       Caller: signed-in user. Verifies the competition is theirs and < 60 s old,
//       then pushes "<creator> started a competition" / "<name> · <goal> — join
//       before <first kickoff ET>" to everyone else. Best-effort, fired on create.
//   { "kind": "auto" }
//       Caller: service role (pg_cron every 15 min). Evaluates two windows
//       against today's first kickoff KT (window = cron interval):
//         [KT−3h, KT−3h+15m)  → "Lineups are in" to anyone without a roster today
//         [KT,    KT+15m)     → "Teams are locked" to everyone
//       Outside both windows it exits with one cheap query.
//
// Secrets: optional VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT for
// Web Push. Without them (or without stored subscriptions) web delivery is
// skipped; Expo push needs no secrets.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isServiceRole } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { currentGameDay } from '../_shared/gameday.ts';
import { logInvocation } from '../_shared/usage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

const WINDOW_MS = 15 * 60_000; // must match the pg_cron interval

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Target = { expo_push_token: string | null; web_push_subscription: unknown };

async function deliver(targets: Target[], title: string, body: string) {
  const expoMessages = targets
    .filter((t) => t.expo_push_token)
    .map((t) => ({ to: t.expo_push_token, title, body, sound: 'default' }));

  let expoSent = 0;
  if (expoMessages.length > 0) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expoMessages),
    });
    if (res.ok) expoSent = expoMessages.length;
    else console.error('expo push failed:', res.status, (await res.text()).slice(0, 200));
  }

  let webSent = 0;
  const webTargets = targets.filter((t) => t.web_push_subscription);
  if (webTargets.length > 0 && VAPID_PUBLIC && VAPID_PRIVATE) {
    try {
      const webpush = (await import('npm:web-push@3')).default;
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
      for (const t of webTargets) {
        try {
          await webpush.sendNotification(
            t.web_push_subscription as never,
            JSON.stringify({ title, body })
          );
          webSent++;
        } catch (e) {
          console.error('web push failed for one subscription:', e);
        }
      }
    } catch (e) {
      console.error('web-push unavailable:', e);
    }
  }

  return { recipients: targets.length, expoSent, webSent };
}

/** "2h 14m" / "14m" / "now". */
function untilText(target: number): string {
  const ms = target - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function firstKickoffToday(): Promise<number | null> {
  const { data } = await admin
    .from('fixtures')
    .select('kickoff_utc')
    .eq('game_day', currentGameDay())
    .order('kickoff_utc')
    .limit(1)
    .maybeSingle();
  return data ? new Date(data.kickoff_utc).getTime() : null;
}

async function handleNudge(req: Request, toUser: string) {
  // identify the sender from their JWT
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth } = await anonClient.auth.getUser(token);
  if (!auth.user) return json({ ok: false, error: 'unauthorized' }, 401);

  // the nudge row must exist (the app inserts it; unique index = rate limit)
  const { data: nudge } = await admin
    .from('nudges')
    .select('id')
    .eq('from_user', auth.user.id)
    .eq('to_user', toUser)
    .eq('game_day', currentGameDay())
    .maybeSingle();
  if (!nudge) return json({ ok: false, error: 'no nudge recorded today' }, 403);

  const [{ data: sender }, { data: target }, kickoff] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', auth.user.id).single(),
    admin
      .from('profiles')
      .select('expo_push_token, web_push_subscription')
      .eq('id', toUser)
      .single(),
    firstKickoffToday(),
  ]);
  if (!target) return json({ ok: false, error: 'recipient not found' }, 404);

  const suffix = kickoff
    ? kickoff > Date.now()
      ? ` — first kickoff in ${untilText(kickoff)}`
      : ' — matches already started'
    : '';
  const result = await deliver(
    [target as Target],
    'Starting XI',
    `${sender?.display_name ?? 'A friend'} nudged you${suffix}`
  );
  return json({ ok: true, kind: 'nudge', ...result });
}

async function handleChat(req: Request, messageId: number) {
  // identify the sender from their JWT
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth } = await anonClient.auth.getUser(token);
  if (!auth.user) return json({ ok: false, error: 'unauthorized' }, 401);

  // the message must exist, belong to the caller, and be recent (anti-spoof/replay)
  const { data: msg } = await admin
    .from('chat_messages')
    .select('id, user_id, body, mentions, gif_url, reply_to_id, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.user_id !== auth.user.id) {
    return json({ ok: false, error: 'message not found' }, 404);
  }
  const msgAge = Date.now() - new Date(msg.created_at).getTime();
  if (msgAge < 0 || msgAge > 60_000) {
    return json({ ok: false, error: 'message too old' }, 403);
  }

  // If this is a reply, the author of the quoted message is a "direct" recipient
  // (notified even on the 'mentions' preference), unless they replied to themselves.
  let replyTargetId: string | null = null;
  if (msg.reply_to_id != null) {
    const { data: orig } = await admin
      .from('chat_messages')
      .select('user_id')
      .eq('id', msg.reply_to_id)
      .maybeSingle();
    if (orig && orig.user_id !== auth.user.id) replyTargetId = orig.user_id as string;
  }

  const { data: sender } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', auth.user.id)
    .single();

  // everyone but the sender who wants any chat notification
  const { data: recipients } = await admin
    .from('profiles')
    .select('id, expo_push_token, web_push_subscription, chat_notifications')
    .neq('id', auth.user.id)
    .in('chat_notifications', ['all', 'mentions']);

  const mentioned = new Set((msg.mentions ?? []) as string[]);
  const name = sender?.display_name ?? 'Someone';
  const text = (msg.body ?? '').trim();
  const preview = msg.gif_url && !text ? 'Sent a GIF' : text.length > 160 ? `${text.slice(0, 157)}…` : text;

  // Bucket each recipient into exactly one push, most-direct first: replied-to
  // beats @-mentioned beats the plain broadcast. Replied-to and mentioned users
  // are notified on 'all' OR 'mentions'; the plain broadcast is 'all' only.
  const replyTargets: Target[] = [];
  const mentionTargets: Target[] = [];
  const messageTargets: Target[] = [];
  for (const r of recipients ?? []) {
    if (replyTargetId && r.id === replyTargetId) replyTargets.push(r as Target);
    else if (mentioned.has(r.id as string)) mentionTargets.push(r as Target);
    else if (r.chat_notifications === 'all') messageTargets.push(r as Target);
  }

  const [replyRes, mentionRes, messageRes] = await Promise.all([
    replyTargets.length
      ? deliver(replyTargets, `${name} replied to you`, preview)
      : Promise.resolve(null),
    mentionTargets.length
      ? deliver(mentionTargets, `${name} mentioned you`, preview)
      : Promise.resolve(null),
    messageTargets.length ? deliver(messageTargets, name, preview) : Promise.resolve(null),
  ]);
  return json({ ok: true, kind: 'chat', reply: replyRes, mention: mentionRes, message: messageRes });
}

/** "Matchday 3" for md3, else a readable stage name — mirrors the client's roundLabel. */
function roundLabel(key: string): string {
  const md = /^md(\d+)$/.exec(key);
  if (md) return `Matchday ${Number(md[1])}`;
  const names: Record<string, string> = {
    group: 'Group stage', league: 'League phase', playoff: 'Play-off', r32: 'Round of 32',
    r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', third: 'Third place', final: 'Final',
  };
  return names[key] ?? key;
}

async function handleCompetition(req: Request, competitionId: string) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth } = await anonClient.auth.getUser(token);
  if (!auth.user) return json({ ok: false, error: 'unauthorized' }, 401);

  // must be the caller's and fresh (anti-spoof/replay)
  const { data: comp } = await admin
    .from('competitions')
    .select('id, name, metric, pick_kind, from_round, to_round, created_by, created_at')
    .eq('id', competitionId)
    .maybeSingle();
  if (!comp || comp.created_by !== auth.user.id) {
    return json({ ok: false, error: 'competition not found' }, 404);
  }
  // created_at is server-stamped by the trigger; a negative age would mean tampering
  const age = Date.now() - new Date(comp.created_at).getTime();
  if (age < 0 || age > 60_000) {
    return json({ ok: false, error: 'competition too old' }, 403);
  }

  const [{ data: span }, { data: creator }, { data: recipients }] = await Promise.all([
    admin.from('competition_spans').select('first_kickoff').eq('id', competitionId).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', auth.user.id).single(),
    admin
      .from('profiles')
      .select('expo_push_token, web_push_subscription')
      .neq('id', auth.user.id),
  ]);

  const metric = comp.metric === 'xi' ? 'Best XI' : `Best ${comp.pick_kind ?? 'player'} pick`;
  const spanText =
    comp.from_round === comp.to_round
      ? roundLabel(comp.from_round)
      : `${roundLabel(comp.from_round)} – ${roundLabel(comp.to_round)}`;
  const closes = span?.first_kickoff
    ? ` — join before ${new Date(span.first_kickoff).toLocaleString('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
      })} ET`
    : '';
  const title = `${creator?.display_name ?? 'Someone'} started a competition`;
  const body = `${comp.name} · ${metric} · ${spanText}${closes}`;
  const res = await deliver((recipients ?? []) as Target[], title, body);
  return json({ ok: true, kind: 'competition', ...res });
}

async function handleAuto() {
  const kickoff = await firstKickoffToday();
  if (!kickoff) return json({ ok: true, idle: true, reason: 'no fixtures today' });

  const now = Date.now();
  const inWindow = (start: number) => now >= start && now < start + WINDOW_MS;
  const results: Record<string, unknown> = {};

  // T−3h: anyone without a roster today
  if (inWindow(kickoff - 3 * 3_600_000)) {
    const [{ data: profiles }, { data: rosters }] = await Promise.all([
      admin.from('profiles').select('id, expo_push_token, web_push_subscription'),
      admin.from('rosters').select('user_id').eq('game_day', currentGameDay()),
    ]);
    const has = new Set((rosters ?? []).map((r) => r.user_id));
    const targets = (profiles ?? []).filter((p) => !has.has(p.id));
    results.lineups = await deliver(
      targets as Target[],
      'Starting XI',
      `Lineups are in, build your XI — first kickoff in ${untilText(kickoff)}`
    );
  }

  // at lock: everyone
  if (inWindow(kickoff)) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('expo_push_token, web_push_subscription');
    results.locked = await deliver(
      (profiles ?? []) as Target[],
      'Starting XI',
      'Teams are locked — see what your friends picked'
    );
  }

  if (Object.keys(results).length === 0) return json({ ok: true, idle: true });
  return json({ ok: true, ...results });
}

Deno.serve(async (req) => {
  // CORS preflight — the nudge path is browser-invoked (functions.invoke).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  logInvocation(admin, 'send-push');
  try {
    const body = await req.json().catch(() => ({}));

    if (body.kind === 'auto') {
      if (!isServiceRole(req, SERVICE_ROLE_KEY)) return json({ ok: false, error: 'unauthorized' }, 401);
      return await handleAuto();
    }
    if (body.kind === 'nudge' && typeof body.to_user === 'string') {
      return await handleNudge(req, body.to_user);
    }
    if (body.kind === 'chat' && body.message_id != null) {
      const id = Number(body.message_id);
      if (!Number.isFinite(id)) return json({ ok: false, error: 'message_id required' }, 400);
      return await handleChat(req, id);
    }
    if (body.kind === 'competition' && typeof body.competition_id === 'string') {
      return await handleCompetition(req, body.competition_id);
    }
    return json({ ok: false, error: 'unknown kind' }, 400);
  } catch (e) {
    console.error('send-push failed:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
