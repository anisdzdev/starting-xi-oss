// Pure competition-goal helpers — no React/Supabase imports (relative imports only: vitest
// has no path alias), unit-tested in goal.test.ts.

import { roundLabel } from '../rounds/roundLabel';
import type { Round } from '../rounds/types';

import type { Competition } from './types';

export type Span = { from: string; to: string };

const isMatchday = (key: string) => /^md\d+$/.test(key);

/** Every round from `from` to `to` (inclusive) in list order; empty when either is unknown. */
function sliceRounds(rounds: Round[], from: string, to: string): Round[] {
  const i = rounds.findIndex((r) => r.key === from);
  const j = rounds.findIndex((r) => r.key === to);
  if (i < 0 || j < 0 || j < i) return [];
  return rounds.slice(i, j + 1);
}

/** All knockout rounds (every non-matchday round), or null before any exist. */
export function knockoutSpan(rounds: Round[]): Span | null {
  const ko = rounds.filter((r) => !isMatchday(r.key));
  return ko.length > 0 ? { from: ko[0].key, to: ko[ko.length - 1].key } : null;
}

/** Every round of the season, or null with no rounds. */
export function seasonSpan(rounds: Round[]): Span | null {
  return rounds.length > 0 ? { from: rounds[0].key, to: rounds[rounds.length - 1].key } : null;
}

/**
 * "Matchday 3" · "Matchday 1 – 3" · "Knockouts" (exactly every non-matchday round) ·
 * "Whole season" (every round) · otherwise "<from label> – <to label>".
 */
export function spanLabel(rounds: Round[], from: string, to: string): string {
  if (from === to) return roundLabel(from);
  const span = sliceRounds(rounds, from, to);
  if (span.length > 0) {
    if (span.length === rounds.length) return 'Whole season';
    const ko = knockoutSpan(rounds);
    if (ko && ko.from === from && ko.to === to) return 'Knockouts';
    if (span.every((r) => isMatchday(r.key))) {
      return `Matchday ${from.slice(2)} – ${to.slice(2)}`;
    }
  }
  return `${roundLabel(from)} – ${roundLabel(to)}`;
}

/** "Best XI · Matchday 3" / "Best keeper pick · Knockouts". */
export function goalLabel(c: Pick<Competition, 'metric' | 'pickKind' | 'fromRound' | 'toRound'>, rounds: Round[]): string {
  const metric = c.metric === 'xi' ? 'Best XI' : `Best ${c.pickKind ?? 'player'} pick`;
  return `${metric} · ${spanLabel(rounds, c.fromRound, c.toRound)}`;
}

/** Joins, picks and deletes close at the span's first kickoff; no fixtures yet = locked. */
export function isLocked(firstKickoff: string | null, now: number): boolean {
  if (!firstKickoff) return true;
  return now >= Date.parse(firstKickoff);
}
