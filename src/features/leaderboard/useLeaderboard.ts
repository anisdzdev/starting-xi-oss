import { useCallback, useEffect, useRef, useState } from 'react';

import type { Season } from '@/features/seasons';
import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

import { latestPlayedDay } from './movement';

export type BoardKey = 'daily' | 'round' | 'overall' | 'team' | 'player' | 'keeper';

export type BoardOptions = {
  /** Daily board: the selected game day (default today). */
  gameDay?: string;
  /** Round board: the selected round key; null = rounds not loaded yet (loading). */
  roundKey?: string | null;
  /** Round board: the previous round's key for movement; null = first round. */
  prevRoundKey?: string | null;
};

export type BoardRow = {
  userId: string;
  name: string;
  /** User avatar (profiles). */
  avatarUrl: string | null;
  /** Pick image for the pick boards (flag / player photo). */
  pickImageUrl?: string | null;
  /** Secondary line (pick name, days played, …). */
  sub?: string | null;
  points: number;
  rank: number;
  /** Rank places gained (+) / lost (−) vs yesterday; null = n/a or new entry. */
  movement: number | null;
};

/** Competition ranks ("1224") for a points-descending list. */
function rankMap(entries: { userId: string; points: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.userId, entries.filter((o) => o.points > e.points).length + 1);
  }
  return map;
}

async function fetchProfiles(): Promise<Map<string, string | null>> {
  const { data } = await getSupabase().from('profiles').select('id, avatar_url');
  return new Map((data ?? []).map((p) => [p.id as string, p.avatar_url as string | null]));
}

async function fetchBoard(
  key: BoardKey,
  season: Season | null,
  opts: BoardOptions
): Promise<BoardRow[] | null> {
  const supabase = getSupabase();
  const today = currentGameDay();

  if (key === 'daily') {
    // Selected day (defaults to today); movement is vs the previous FIXTURE day —
    // a club season plays twice a week, so "yesterday" is usually a rest day.
    const day = opts.gameDay ?? today;
    // Previous fixture day within the season (so the first CL day never compares
    // against the World Cup final); one row, newest first.
    const { data: prior } = await supabase
      .from('fixtures')
      .select('game_day')
      .gte('game_day', season?.startsOn ?? '0000-01-01')
      .lt('game_day', day)
      .order('game_day', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevDay = (prior as { game_day: string } | null)?.game_day ?? null;
    const [{ data }, { data: prev }] = await Promise.all([
      supabase.from('daily_leaderboard').select('*').eq('game_day', day).order('rank'),
      prevDay
        ? supabase.from('daily_leaderboard').select('user_id, rank').eq('game_day', prevDay)
        : Promise.resolve({ data: [] as { user_id: string; rank: number }[] }),
    ]);
    const prevRank = new Map((prev ?? []).map((r) => [r.user_id as string, r.rank as number]));
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      avatarUrl: r.avatar_url,
      points: r.points,
      rank: r.rank,
      movement: prevRank.has(r.user_id) ? prevRank.get(r.user_id)! - r.rank : null,
    }));
  }

  // Every other board is per SEASON — nothing to show until seasons are loaded.
  if (!season) return null;

  if (key === 'round') {
    // One league-phase matchday (both game days) or a knockout stage; movement vs
    // the previous round's final ranks. Null round = rounds still loading.
    if (!opts.roundKey) return null;
    const [{ data }, { data: prev }] = await Promise.all([
      supabase
        .from('round_leaderboard')
        .select('*')
        .eq('season_id', season.id)
        .eq('round_key', opts.roundKey)
        .order('rank'),
      opts.prevRoundKey
        ? supabase
            .from('round_leaderboard')
            .select('user_id, rank')
            .eq('season_id', season.id)
            .eq('round_key', opts.prevRoundKey)
        : Promise.resolve({ data: [] as { user_id: string; rank: number }[] }),
    ]);
    const prevRank = new Map((prev ?? []).map((r) => [r.user_id as string, r.rank as number]));
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      avatarUrl: r.avatar_url,
      sub: `${r.days_played} day${r.days_played === 1 ? '' : 's'} played`,
      points: r.points,
      rank: r.rank,
      movement: prevRank.has(r.user_id) ? prevRank.get(r.user_id)! - r.rank : null,
    }));
  }

  if (key === 'overall') {
    // Overall is per SEASON (the view buckets game days into season date ranges).
    const [{ data }, { data: allDaily }, { data: startedRows }] = await Promise.all([
      supabase.from('overall_leaderboard').select('*').eq('season_id', season.id).order('rank'),
      supabase
        .from('daily_leaderboard')
        .select('user_id, game_day, points')
        .gte('game_day', season.startsOn)
        .lte('game_day', season.endsOn),
      supabase
        .from('fixtures')
        .select('game_day')
        .eq('season_id', season.id)
        .in('status', ['live', 'finished']),
    ]);
    // "Before the latest PLAYED day": totals minus the newest game day whose
    // fixtures have started — daily rows exist (at 0) as soon as an XI is saved,
    // so a future day must not become the baseline. On a rest day the arrows
    // still show what the last matchday changed.
    const startedDays = new Set(
      (startedRows ?? []).map((r) => (r as { game_day: string }).game_day)
    );
    const latest = latestPlayedDay((allDaily ?? []) as { game_day: string }[], startedDays);
    const prevTotals = new Map<string, number>();
    for (const r of allDaily ?? []) {
      if (r.game_day === latest) continue;
      prevTotals.set(r.user_id, (prevTotals.get(r.user_id) ?? 0) + r.points);
    }
    const prevRank = rankMap(
      [...prevTotals.entries()].map(([userId, points]) => ({ userId, points }))
    );
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      avatarUrl: r.avatar_url,
      sub: `${r.days_played} day${r.days_played === 1 ? '' : 's'} played`,
      points: r.points,
      rank: r.rank,
      movement: prevRank.has(r.user_id) ? prevRank.get(r.user_id)! - r.rank : null,
    }));
  }

  // pick boards (static picks — no daily movement)
  const avatars = await fetchProfiles();
  if (key === 'team') {
    const { data } = await supabase
      .from('team_pick_leaderboard')
      .select('*')
      .eq('season_id', season.id)
      .order('rank');
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      avatarUrl: avatars.get(r.user_id) ?? null,
      pickImageUrl: r.flag_url,
      sub: `${r.team_name} · ${r.played} played`,
      points: r.points,
      rank: r.rank,
      movement: null,
    }));
  }

  const view = key === 'player' ? 'player_pick_leaderboard' : 'keeper_pick_leaderboard';
  const nameCol = key === 'player' ? 'player_name' : 'keeper_name';
  const { data } = await supabase.from(view).select('*').eq('season_id', season.id).order('rank');
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    avatarUrl: avatars.get(r.user_id) ?? null,
    pickImageUrl: r.image_url,
    sub: r[nameCol],
    points: r.points,
    rank: r.rank,
    movement: null,
  }));
}

/**
 * One leaderboard with refresh + (for daily/overall) live updates: any
 * player_match_stats change triggers a debounced refetch.
 * `season` scopes Overall and the pick boards; null = seasons not loaded yet
 * (those boards stay loading). Daily is keyed by game day alone and renders
 * without a season.
 */
export function useLeaderboard(key: BoardKey, season: Season | null, opts: BoardOptions = {}) {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { gameDay, roundKey = null, prevRoundKey = null } = opts;
  const keyRef = useRef(key);
  keyRef.current = key;
  // Updated inside the refetch effect below (not during render) so `refresh`
  // from the realtime channel always sees the current season/round.
  const seasonRef = useRef(season);
  const optsRef = useRef<BoardOptions>({ gameDay, roundKey, prevRoundKey });

  const refresh = useCallback(async () => {
    const data = await fetchBoard(keyRef.current, seasonRef.current, optsRef.current);
    if (data) setRows(data);
  }, []);

  // refetch when switching boards, season, selected day or round
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    setRows(null);
    seasonRef.current = season;
    optsRef.current = { gameDay, roundKey, prevRoundKey };
    // Daily is game-day keyed and renders without a season; the others wait.
    fetchBoard(key, season, { gameDay, roundKey, prevRoundKey }).then((data) => {
      if (!cancelled && data) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [key, season, gameDay, roundKey, prevRoundKey]);

  // realtime: stats changes move daily/overall boards
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = getSupabase()
      .channel(`board-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_match_stats' },
        () => {
          if (!['daily', 'round', 'overall'].includes(keyRef.current)) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(refresh, 1500);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(channel);
    };
  }, [refresh]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return { rows, loading: rows === null, refreshing, pullToRefresh };
}
