import {
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

import { getSupabase } from '@/lib/supabase';

import { LiveActivity } from './native';

/**
 * Pre-download the day's player photos + team flags into the shared App Group
 * container so the Live Activity widget (no network access) can render them by
 * file path. Missing files fall back to monogram / country-code in the widget.
 *
 * Idempotent and best-effort: existing files are skipped, failures are ignored.
 * Files: `<appGroup>/players/<playerId>.png`, `<appGroup>/flags/<CODE>.png`.
 */
export async function cacheActivityImages(gameDay: string): Promise<void> {
  const base = LiveActivity.appGroupPath();
  if (!base) return;

  const root = base.startsWith('file://') ? base : `file://${base}`;
  const playersDir = `${root}/players`;
  const flagsDir = `${root}/flags`;

  try {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // the user's roster players (photos) for the day
    const { data: roster } = await supabase
      .from('rosters')
      .select('roster_players(players(id, image_url, team_id))')
      .eq('user_id', user.id)
      .eq('game_day', gameDay)
      .maybeSingle();

    // teams playing that day (flags), via the day's fixtures
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select(
        'home:teams!fixtures_home_team_fkey(code, flag_url), away:teams!fixtures_away_team_fkey(code, flag_url)'
      )
      .eq('game_day', gameDay);

    await makeDirectoryAsync(playersDir, { intermediates: true }).catch(() => {});
    await makeDirectoryAsync(flagsDir, { intermediates: true }).catch(() => {});

    type PlayerRow = { players: { id: number; image_url: string | null } | null };
    type TeamRef = { code: string; flag_url: string | null } | null;

    // supabase infers to-one embeds as arrays without generated types; at
    // runtime they are objects, so cast through unknown.
    const players = ((roster?.roster_players ?? []) as unknown as PlayerRow[])
      .map((rp) => rp.players)
      .filter((p): p is { id: number; image_url: string | null } => !!p);

    const teams = new Map<string, string>();
    for (const f of (fixtures ?? []) as unknown as { home: TeamRef; away: TeamRef }[]) {
      for (const t of [f.home, f.away]) {
        if (t?.code && t.flag_url) teams.set(t.code.toUpperCase(), t.flag_url);
      }
    }

    const jobs: Promise<unknown>[] = [];
    for (const p of players) {
      if (p.image_url) jobs.push(downloadIfMissing(p.image_url, `${playersDir}/${p.id}.png`));
    }
    for (const [code, url] of teams) {
      jobs.push(downloadIfMissing(url, `${flagsDir}/${code}.png`));
    }
    await Promise.all(jobs);
  } catch {
    // best-effort cache — never throw into the registration flow
  }
}

async function downloadIfMissing(url: string, dest: string): Promise<void> {
  try {
    const info = await getInfoAsync(dest);
    if (info.exists) return;
    await downloadAsync(url, dest);
  } catch {
    // ignore individual download failures (widget falls back to monogram/code)
  }
}
