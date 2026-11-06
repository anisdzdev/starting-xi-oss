// scout-card — AI scout report for a player, cached per (player_id, game_day).
//
// POST { "player_id": 123, "game_day"?: "YYYY-MM-DD", "regenerate"?: true }
//   → { ok: true, cached: boolean, card: ScoutCard }
//
// Cache: scout_cards (unique player_id + game_day). regenerate overwrites.
// On miss: builds a prompt from the player's recent player_match_stats and
// today's opponent, calls OpenAI gpt-4o-mini (JSON mode, ~150 output tokens),
// stores and returns the card.
//
// Auth: any signed-in user (JWT verified against auth); service role also accepted.
// Secrets: OPENAI_API_KEY (supabase secrets set OPENAI_API_KEY=...).

import { createClient } from 'npm:@supabase/supabase-js@2';

import { isServiceRole } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { currentGameDay } from '../_shared/gameday.ts';
import { logInvocation } from '../_shared/usage.ts';

type ScoutCard = {
  form_summary: string;
  strengths: [string, string];
  risk: string;
  pick_verdict: string;
  confidence: number; // 1–5
  generated_at: string;
  model: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('SCOUT_MODEL') ?? 'gpt-4o-mini';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callerIsAllowed(req: Request): Promise<boolean> {
  if (isServiceRole(req, SERVICE_ROLE_KEY)) return true;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.getUser(token);
  return !error && !!data.user;
}

async function buildContext(playerId: number, gameDay: string) {
  const { data: player, error } = await admin
    .from('players')
    .select(
      'id, name, position, club, season:seasons(name, kind), ' +
        'team:teams!players_team_id_fkey(id, name, code)'
    )
    .eq('id', playerId)
    .single();
  if (error || !player) throw new Error(`player ${playerId} not found`);
  const team = player.team as unknown as { id: number; name: string; code: string };
  // A nation season's `club` is the player's club; a club season's is their nationality.
  const season = (player.season as unknown as { name: string; kind: 'nation' | 'club' } | null) ?? {
    name: 'the competition',
    kind: 'nation' as const,
  };

  // last 5 performances (joined fixture for date + score context)
  const { data: stats } = await admin
    .from('player_match_stats')
    .select(
      'minutes, goals, assists, clean_sheet, saves, yellows, reds, rating, bonus, fpl_points, ' +
        'fixture:fixtures(game_day, kickoff_utc, home_score, away_score, ' +
        'home:teams!fixtures_home_team_fkey(name), away:teams!fixtures_away_team_fkey(name))'
    )
    .eq('player_id', playerId)
    .limit(10);

  const recent = (stats ?? [])
    .map((s) => ({ ...s, fixture: s.fixture as unknown as Record<string, any> }))
    .sort((a, b) => String(b.fixture?.kickoff_utc).localeCompare(String(a.fixture?.kickoff_utc)))
    .slice(0, 5)
    .map((s) => ({
      match: `${s.fixture?.home?.name} ${s.fixture?.home_score ?? '-'}–${s.fixture?.away_score ?? '-'} ${s.fixture?.away?.name}`,
      minutes: s.minutes,
      goals: s.goals,
      assists: s.assists,
      clean_sheet: s.clean_sheet,
      saves: s.saves,
      cards: s.yellows + s.reds,
      rating: s.rating,
      fpl_points: s.fpl_points,
    }));

  // today's opponent
  const { data: fixture } = await admin
    .from('fixtures')
    .select(
      'kickoff_utc, home_team, away_team, ' +
        'home:teams!fixtures_home_team_fkey(id, name), away:teams!fixtures_away_team_fkey(id, name)'
    )
    .eq('game_day', gameDay)
    .or(`home_team.eq.${team.id},away_team.eq.${team.id}`)
    .maybeSingle();

  const fx = fixture as unknown as Record<string, any> | null;
  const opponent = fx ? (fx.home?.id === team.id ? fx.away?.name : fx.home?.name) : null;

  return { player, team, season, recent, opponent, kickoff: fx?.kickoff_utc ?? null };
}

async function generateCard(ctx: Awaited<ReturnType<typeof buildContext>>): Promise<ScoutCard> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured (supabase secrets set OPENAI_API_KEY=...)');
  }

  const { player, team, season, recent, opponent } = ctx;
  const affiliation = player.club
    ? season.kind === 'nation'
      ? `, plays club football for ${player.club}`
      : ` (${player.club})`
    : '';
  const prompt = [
    `You are a sharp, concise football scout for a daily fantasy game (FPL-style scoring).`,
    `Player: ${player.name}, ${player.position}, ${team.name}${affiliation}.`,
    opponent
      ? `Today's ${season.name} match: ${team.name} vs ${opponent}.`
      : `No confirmed match today.`,
    recent.length > 0
      ? `Recent ${season.name} performances (newest first): ${JSON.stringify(recent)}`
      : `No ${season.name} stats yet.`,
    `Return STRICT JSON: {"form_summary": string (<=25 words), "strengths": [string, string] (each <=10 words),`,
    `"risk": string (<=15 words), "pick_verdict": string (<=12 words, decisive),`,
    `"confidence": integer 1-5 (5 = nailed-on pick)}.`,
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 250,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');

  const strengths = Array.isArray(raw.strengths) ? raw.strengths.map(String) : [];
  return {
    form_summary: String(raw.form_summary ?? 'No read on current form.'),
    strengths: [strengths[0] ?? 'Regular starter', strengths[1] ?? 'Set-piece involvement'],
    risk: String(raw.risk ?? 'Rotation risk unknown.'),
    pick_verdict: String(raw.pick_verdict ?? 'Neutral pick.'),
    confidence: Math.min(5, Math.max(1, Math.round(Number(raw.confidence) || 3))),
    generated_at: new Date().toISOString(),
    model: OPENAI_MODEL,
  };
}

Deno.serve(async (req) => {
  // CORS preflight — must be answered before any auth check (the browser sends
  // OPTIONS without credentials, so callerIsAllowed would 401 it).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await callerIsAllowed(req))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  logInvocation(admin, 'scout-card');

  try {
    const body = await req.json().catch(() => ({}));
    const playerId = Number(body.player_id);
    if (!Number.isFinite(playerId)) return json({ ok: false, error: 'player_id required' }, 400);
    const gameDay = typeof body.game_day === 'string' ? body.game_day : currentGameDay();
    const regenerate = body.regenerate === true;

    if (!regenerate) {
      const { data: hit } = await admin
        .from('scout_cards')
        .select('content')
        .eq('player_id', playerId)
        .eq('game_day', gameDay)
        .maybeSingle();
      if (hit?.content) return json({ ok: true, cached: true, card: hit.content });
    }

    const ctx = await buildContext(playerId, gameDay);
    const card = await generateCard(ctx);

    const { error: upsertErr } = await admin
      .from('scout_cards')
      .upsert(
        { player_id: playerId, game_day: gameDay, content: card },
        { onConflict: 'player_id,game_day' }
      );
    if (upsertErr) console.error('scout_cards upsert:', upsertErr.message);

    return json({ ok: true, cached: false, card });
  } catch (e) {
    console.error('scout-card failed:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
