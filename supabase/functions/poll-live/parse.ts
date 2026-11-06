// Pure FotMob matchDetails parsing for poll-live — no Deno globals or network,
// so it can be unit-tested (see parse.test.ts) against real captured responses.

import { emptyStats, type MatchStats } from '../_shared/scoring.ts';

export function mapStatus(s: Record<string, unknown> | undefined): string {
  if (!s) return 'scheduled';
  if (s.cancelled) return 'cancelled';
  const reason = String((s.reason as Record<string, unknown> | undefined)?.longKey ?? '');
  // abandoned matches void like postponements (replayed/resumed later per FIFA rules)
  if (reason.includes('postponed') || reason.includes('abandon')) return 'postponed';
  if (s.finished) return 'finished';
  if (s.started) return 'live';
  return 'scheduled';
}

/**
 * Approximate elapsed match minute from header.status.liveTime, e.g. "31’" → 31,
 * "30:50" → 30, "HT" → basePeriod (45). Used to estimate minutes played DURING a
 * live match — FotMob omits the per-player "Minutes played" stat until full time
 * (see parsePlayers). Defaults to 1 so an on-pitch player always clears the
 * "played any minutes" gate.
 */
export function liveMinuteOf(status: Record<string, any> | undefined): number {
  const lt = (status?.liveTime ?? {}) as Record<string, any>;
  const short = String(lt.short ?? '');
  const m = short.match(/\d+/);
  if (m) return Number(m[0]);
  const long = String(lt.long ?? '');
  const mm = long.split(':')[0];
  if (/^\d+$/.test(mm)) return Number(mm);
  const base = Number(lt.basePeriod ?? 0);
  return base > 0 ? base : 1;
}

/**
 * The FotMob live clock as a DISPLAY string (e.g. "66'", "90+2'") for the Live
 * Activity — distinct from liveMinuteOf (a number used for player-minute math).
 * Returns null when there's no live time (scheduled/HT-with-no-clock/finished),
 * so callers can fall back / store null.
 */
export function liveClockOf(status: Record<string, any> | undefined): string | null {
  const short = String((status?.liveTime as Record<string, any> | undefined)?.short ?? '').trim();
  if (!short) return null;
  return short.replace(/[’']/g, "'"); // normalize FotMob's curly apostrophe
}

/** Find a labeled value across a playerStats entry's stat sections. */
export function getStat(entry: Record<string, any>, ...labels: string[]): number | null {
  for (const section of entry.stats ?? []) {
    for (const label of labels) {
      const v = section?.stats?.[label]?.stat?.value;
      if (typeof v === 'number') return v;
    }
  }
  return null;
}

export type ParsedPlayer = { stats: MatchStats; rating: number | null; isSub: boolean };

/**
 * Merge content.playerStats (numbers) with lineup performance.events (cards etc.).
 *
 * `liveMinutes`: the match clock when the game is in progress, else null.
 * FotMob only attaches the per-player "Minutes played" stat once a match is
 * FINISHED — during live play the stat is absent even for players on the pitch.
 * So when "Minutes played" is missing but the player has populated live stats (a
 * rating / non-empty stat sections — i.e. they're on the pitch, not an unused
 * sub), we fall back to `liveMinutes` as their minutes. Without this every player
 * reads 0 minutes during a live match, gets skipped, and no points appear until
 * full time. The minute is an approximation (a sub gets over-credited until FT,
 * when the real value overwrites it), good enough for the appearance and 60-min
 * gates while the match is running.
 *
 * concededByTeamId: full-match goals conceded per FotMob team id. FotMob only
 * exposes a per-player "Goals conceded" label for goalkeepers, so outfield
 * players fall back to their team's full-match conceded count (approximation:
 * a sub who came on after all goals still gets them attributed).
 */
export function parsePlayers(
  content: Record<string, any>,
  concededByTeamId: Map<number, number>,
  liveMinutes: number | null
): Map<number, ParsedPlayer> {
  const out = new Map<number, ParsedPlayer>();

  // Substitutes who actually came on (have a subIn event) — used to credit the
  // coach-of-the-day for impactful substitutions.
  const subIds = new Set<number>();
  const lineup0 = content?.lineup ?? {};
  for (const side of ['homeTeam', 'awayTeam']) {
    for (const s of lineup0[side]?.subs ?? []) {
      const evs = s?.performance?.substitutionEvents ?? [];
      const cameOn = evs.some(
        (e: Record<string, any>) => String(e?.type ?? '').toLowerCase() === 'subin'
      );
      if (s?.id != null && cameOn) subIds.add(Number(s.id));
    }
  }

  const ensure = (fotmobId: number): ParsedPlayer => {
    let p = out.get(fotmobId);
    if (!p) {
      p = { stats: emptyStats(), rating: null, isSub: subIds.has(fotmobId) };
      out.set(fotmobId, p);
    }
    return p;
  };

  for (const entry of Object.values(content?.playerStats ?? {}) as Record<string, any>[]) {
    if (!entry?.id) continue;
    const reported = getStat(entry, 'Minutes played');
    // Populated stat sections (a rating) mean the player is on the pitch — the
    // signal we use to credit live minutes when "Minutes played" isn't there yet.
    const onPitchLive = Array.isArray(entry.stats) && entry.stats.length > 0;
    const minutes =
      reported ?? (liveMinutes != null && onPitchLive ? liveMinutes : 0);
    if (minutes <= 0) continue; // unused bench players get no row
    const p = ensure(Number(entry.id));
    p.stats.minutes = minutes;
    p.stats.goals = getStat(entry, 'Goals') ?? 0;
    p.stats.assists = getStat(entry, 'Assists') ?? 0;
    p.stats.saves = getStat(entry, 'Saves') ?? 0;
    // penSaves / penMisses come from lineup performance.events below, NOT from a
    // stat label: the per-player "Saved penalties"/"Missed penalty" labels (like
    // "Minutes played") only appear once a match is FINISHED, so reading them here
    // would never score a live penalty. The events are present live AND at full
    // time, so they're the single source of truth (using both would double-count).
    p.stats.goalsConceded =
      getStat(entry, 'Goals conceded') ?? concededByTeamId.get(Number(entry.teamId)) ?? 0;
    p.rating = getStat(entry, 'FotMob rating');
  }

  // Cards, own goals and penalty misses only appear as lineup performance events.
  const lineup = content?.lineup ?? {};
  for (const side of ['homeTeam', 'awayTeam']) {
    const squad = [...(lineup[side]?.starters ?? []), ...(lineup[side]?.subs ?? [])];
    for (const member of squad) {
      const events: Record<string, any>[] = member?.performance?.events ?? [];
      if (!member?.id || events.length === 0) continue;
      const p = out.get(Number(member.id));
      if (!p) continue; // events but no minutes — ignore
      for (const ev of events) {
        const type = String(ev.type ?? '').toLowerCase();
        // FotMob event types (verified on real captures): redCard, yellowCard,
        // ownGoal, missedPenalty (the taker), savedPenalty (the keeper who saved).
        if (type.includes('red')) p.stats.reds += 1;
        else if (type.includes('yellow')) p.stats.yellows += 1;
        else if (type.includes('owngoal')) p.stats.ownGoals += 1;
        else if (type.includes('savedpenalty') || type.includes('penaltysave'))
          p.stats.penSaves += 1;
        else if (
          type.includes('missedpenalty') ||
          type.includes('penaltymiss') ||
          type.includes('penmiss')
        )
          p.stats.penMisses += 1;
      }
    }
  }

  for (const p of out.values()) {
    p.stats.cleanSheet = p.stats.minutes > 0 && p.stats.goalsConceded === 0;
  }
  return out;
}

/** FotMob player id of the Man of the Match, or null (predicted/unfinished). */
export function parseMotm(content: Record<string, any>): number | null {
  const id = content?.matchFacts?.playerOfTheMatch?.id;
  if (typeof id === 'number') return id;
  if (id != null && /^\d+$/.test(String(id))) return Number(id);
  return null;
}

export type CoachCard = { isHome: boolean; yellows: number; reds: number };

/**
 * Coach cards from matchFacts.events. A coach card is a Card event whose
 * cardDescription.localizedKey === 'coach'; player.id is the coach's FotMob id
 * (= coaches.id). card is 'Yellow' | 'Red' | 'YellowRed' (second yellow = a red).
 */
export function parseCoachCards(content: Record<string, any>): Map<number, CoachCard> {
  const out = new Map<number, CoachCard>();
  const events: Record<string, any>[] = content?.matchFacts?.events?.events ?? [];
  for (const ev of events) {
    if (String(ev?.type ?? '') !== 'Card') continue;
    if (ev?.cardDescription?.localizedKey !== 'coach') continue;
    const id = Number(ev?.player?.id);
    if (!Number.isFinite(id)) continue;
    const c = out.get(id) ?? { isHome: !!ev.isHome, yellows: 0, reds: 0 };
    const card = String(ev?.card ?? '').toLowerCase();
    if (card === 'red' || card === 'yellowred') c.reds += 1;
    else if (card === 'yellow') c.yellows += 1;
    c.isHome = !!ev.isHome;
    out.set(id, c);
  }
  return out;
}

export type LineupCoach = { id: number; name: string } | null;

/** Home/away coach identities from the lineup (for upserting into `coaches`). */
export function parseCoaches(
  content: Record<string, any>
): { home: LineupCoach; away: LineupCoach } {
  const read = (side: string): LineupCoach => {
    const c = content?.lineup?.[side]?.coach;
    if (!c || c.id == null) return null;
    return { id: Number(c.id), name: String(c.name ?? '') };
  };
  return { home: read('homeTeam'), away: read('awayTeam') };
}
