// Pure round helpers — no React/Supabase imports, unit-tested in roundLabel.test.ts.
// Round keys come from fixtures.round_key: 'md<N>' or a stage name.

import type { Round } from './types';

const STAGE_LABELS: Record<string, string> = {
  group: 'Group stage',
  league: 'League phase',
  playoff: 'Play-off',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-finals',
  sf: 'Semi-finals',
  third: 'Third place',
  final: 'Final',
};

/** "Matchday 3" for md3, a stage name for knockouts, the raw key when unknown. */
export function roundLabel(key: string): string {
  const md = /^md(\d+)$/.exec(key);
  if (md) return `Matchday ${Number(md[1])}`;
  return STAGE_LABELS[key] ?? key;
}

/** The round whose inclusive game-day range contains `day`, or null (rest day / gap). */
export function roundOfDay(rounds: Round[], day: string): Round | null {
  return rounds.find((r) => day >= r.startsOn && day <= r.endsOn) ?? null;
}

/** Adjacent round in a list ordered by startsOn; null at the ends or for an unknown key. */
export function stepRound(rounds: Round[], key: string, dir: 'older' | 'newer'): Round | null {
  const i = rounds.findIndex((r) => r.key === key);
  if (i < 0) return null;
  return rounds[dir === 'older' ? i - 1 : i + 1] ?? null;
}

/**
 * Default round to open a season on: the round containing `day`, else the latest
 * round that has started by `day`, else the first round, else null.
 */
export function defaultRoundFor(rounds: Round[], day: string): Round | null {
  const current = roundOfDay(rounds, day);
  if (current) return current;
  let latest: Round | null = null;
  for (const r of rounds) if (r.startsOn <= day) latest = r;
  return latest ?? rounds[0] ?? null;
}
