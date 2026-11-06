// Pure fixture-stage inference for ingest-fotmob (feeds fixtures.stage, which
// team_pick_points() scores). No Deno globals — unit-tested in stage.test.ts.
//
// Verified FotMob shapes (2026-10-14):
//   league endpoint allMatches → `round` ("1".."8" | "playoff" | "1/8" | "1/4" |
//     "1/2" | "final") + `roundName` (number | "Round of 16" | "Quarter-Finals" …)
//   by-date matches            → `tournamentStage` ("3" = matchday 3)
// World Cup (nation) matches use `round` numbers + `group` for the group stage.

import { gameDayOf } from '../_shared/gameday.ts';

import type { SeasonKind } from './codes.ts';

/** Knockout stage from a round label; null when it isn't a knockout label. */
function knockoutStage(label: string): string | null {
  const name = label.toLowerCase();
  if (!name) return null;
  if (name.includes('playoff') || name.includes('play-off')) return 'playoff';
  if (name.includes('1/16') || name.includes('32')) return 'r32';
  if (name.includes('1/8') || name.includes('16')) return 'r16';
  if (name.includes('1/4') || name.includes('quarter')) return 'qf';
  if (name.includes('1/2') || name.includes('semi')) return 'sf';
  if (name.includes('bronze') || name.includes('third') || name.includes('3rd')) return 'third';
  if (name.includes('final')) return 'final';
  return null;
}

export function inferStage(m: Record<string, unknown>, kind: SeasonKind): string {
  const round = String(m.round ?? m.tournamentStage ?? '');
  const numeric = /^[0-9]+$/.test(round);

  if (kind === 'club') {
    if (numeric) return 'league';
    return (
      knockoutStage(String(m.roundName ?? '')) ?? knockoutStage(round) ?? 'league'
    );
  }

  // nation (World Cup)
  if (m.group || numeric) return 'group';
  const ko = knockoutStage(String(m.roundName ?? '')) ?? knockoutStage(round);
  if (ko) return ko;
  // calendar fallback (WC2026)
  const status = m.status as { utcTime?: string } | undefined;
  const d = gameDayOf(status?.utcTime ?? Date.now());
  if (d <= '2026-06-27') return 'group';
  if (d <= '2026-07-03') return 'r32';
  if (d <= '2026-07-07') return 'r16';
  if (d <= '2026-07-11') return 'qf';
  if (d <= '2026-07-15') return 'sf';
  if (d <= '2026-07-18') return 'third';
  return 'final';
}

/**
 * League-phase matchday number from FotMob `round` ("1".."8", league endpoint) or
 * `tournamentStage` ("3", by-date endpoint); null for knockout rounds / unknown.
 */
export function parseMatchday(m: Record<string, unknown>): number | null {
  const raw = String(m.round ?? m.tournamentStage ?? '');
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  // Mirrors the fixtures.matchday CHECK (1..60): the upsert is one batch per
  // season, so a single out-of-range value must become null, not fail the run.
  return n >= 1 && n <= 60 ? n : null;
}
