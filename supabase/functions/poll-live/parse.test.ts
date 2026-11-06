import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { basePoints, type Position } from '../_shared/scoring.ts';
import {
  liveClockOf,
  liveMinuteOf,
  mapStatus,
  parseCoachCards,
  parseCoaches,
  parseMotm,
  parsePlayers,
} from './parse.ts';

const coachCards = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'coach-cards.json'),
    'utf8'
  )
) as Record<string, any>;

// Real FotMob matchDetails captured mid-match (Brazil 0–1 Morocco, ~31', WC2026
// 2026-06-13). Minutes were trimmed but the structure is verbatim. Regression
// guard for the bug where live matches scored 0 because FotMob omits the
// per-player "Minutes played" stat until full time.
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const live = JSON.parse(
  readFileSync(join(FIXTURE_DIR, '__fixtures__', 'bra-mar-live.json'), 'utf8')
) as Record<string, any>;

const SAIBARI_ID = 1180288; // scored, Morocco midfielder
const BENCH_ID = 157865; // unused sub — empty stats sections

function concededMap(md: Record<string, any>): Map<number, number> {
  const teams = md.header?.teams ?? [];
  return new Map<number, number>([
    [Number(teams[0]?.id), Number(teams[1]?.score ?? 0)],
    [Number(teams[1]?.id), Number(teams[0]?.score ?? 0)],
  ]);
}

describe('poll-live parse — live match (no "Minutes played" from FotMob)', () => {
  it('mapStatus reads the in-progress match as live', () => {
    expect(mapStatus(live.header.status)).toBe('live');
  });

  it('liveMinuteOf parses the match clock', () => {
    expect(liveMinuteOf(live.header.status)).toBe(31);
  });

  it('REGRESSION: with no live-minute fallback, every player is skipped (the bug)', () => {
    const parsed = parsePlayers(live.content, concededMap(live), null);
    expect(parsed.size).toBe(0);
  });

  it('credits on-pitch players (and the scorer) once minutes are approximated', () => {
    const minute = liveMinuteOf(live.header.status);
    const parsed = parsePlayers(live.content, concededMap(live), minute);

    // 22 players on the pitch get rows; ~29 unused subs do not.
    expect(parsed.size).toBe(22);
    expect(parsed.has(BENCH_ID)).toBe(false);

    const saibari = parsed.get(SAIBARI_ID);
    expect(saibari).toBeDefined();
    expect(saibari!.stats.minutes).toBe(minute);
    expect(saibari!.stats.goals).toBe(1);

    // A midfielder's goal + appearance must produce live points (not 0).
    const pts = basePoints('MID' as Position, saibari!.stats);
    expect(pts).toBe(1 + 5); // appearance (<60') + MID goal
  });

  it('finished-style parse is unchanged when liveMinutes is null but minutes exist', () => {
    // Synthetic finished entry: FotMob attaches "Minutes played" at full time.
    const finished = {
      playerStats: {
        '999': {
          id: 999,
          teamId: 1,
          stats: [
            {
              title: 'Top stats',
              stats: {
                'Minutes played': { stat: { value: 90 } },
                Goals: { stat: { value: 1 } },
                'FotMob rating': { stat: { value: 8.1 } },
              },
            },
          ],
        },
      },
    };
    const parsed = parsePlayers(finished, new Map([[1, 0]]), null);
    expect(parsed.get(999)!.stats.minutes).toBe(90);
    expect(parsed.get(999)!.stats.goals).toBe(1);
  });
});

describe('penalty events from lineup performance.events', () => {
  // Verified against the REAL Poland 0–2 Argentina (WC2022, match 3854576) where
  // Messi missed a penalty Szczesny saved: FotMob encodes the miss as event type
  // `missedPenalty` and the keeper's save as `savedPenalty` in lineup
  // performance.events. The per-player "Missed penalty" / "Saved penalties" STAT
  // labels only appear once a match is FINISHED (like "Minutes played"), so the
  // events are the only live-available source — and they persist to full time.
  const content = {
    playerStats: {
      '10': { id: 10, teamId: 1, stats: [{ title: 't', stats: { 'FotMob rating': { stat: { value: 7 } } } }] },
      '20': { id: 20, teamId: 2, stats: [{ title: 't', stats: { 'FotMob rating': { stat: { value: 7 } } } }] },
    },
    lineup: {
      homeTeam: {
        starters: [{ id: 10, name: 'Penalty Misser', performance: { events: [{ type: 'missedPenalty' }] } }],
        subs: [],
      },
      awayTeam: {
        starters: [{ id: 20, name: 'Keeper', performance: { events: [{ type: 'savedPenalty' }] } }],
        subs: [],
      },
    },
  };

  it('credits a missed penalty (penMisses) live from the missedPenalty event', () => {
    const parsed = parsePlayers(content, new Map([[1, 0], [2, 0]]), 39);
    expect(parsed.get(10)!.stats.penMisses).toBe(1);
  });

  it('credits a saved penalty (penSaves) to the keeper from the savedPenalty event', () => {
    const parsed = parsePlayers(content, new Map([[1, 0], [2, 0]]), 39);
    expect(parsed.get(20)!.stats.penSaves).toBe(1);
  });

  it('does not double-count: only one penMiss per missedPenalty event', () => {
    const parsed = parsePlayers(content, new Map([[1, 0], [2, 0]]), 39);
    expect(parsed.get(20)!.stats.penMisses).toBe(0);
    expect(parsed.get(10)!.stats.penSaves).toBe(0);
  });
});

describe('liveClockOf', () => {
  it('returns the FotMob short clock, normalizing the apostrophe', () => {
    expect(liveClockOf({ liveTime: { short: "66’" } })).toBe("66'");
    expect(liveClockOf({ liveTime: { short: "90+2'" } })).toBe("90+2'");
  });
  it('returns null when there is no live time', () => {
    expect(liveClockOf(undefined)).toBeNull();
    expect(liveClockOf({})).toBeNull();
  });
});

describe('coach of the day parsing', () => {
  const content = coachCards.content as Record<string, any>;

  it('parseMotm returns the player of the match fotmob id', () => {
    expect(parseMotm(content)).toBe(920101);
  });

  it('parseCoachCards aggregates coach cards by coach id, ignoring player cards', () => {
    const cards = parseCoachCards(content);
    expect(cards.get(26630)).toEqual({ isHome: false, yellows: 0, reds: 1 });
    expect(cards.get(78626)).toEqual({ isHome: true, yellows: 1, reds: 0 });
    expect(cards.has(555)).toBe(false); // player card, not a coach
  });

  it('parseCoaches returns home/away coach identities', () => {
    const c = parseCoaches(content);
    expect(c.home).toEqual({ id: 78626, name: 'David Moyes' });
    expect(c.away).toEqual({ id: 26630, name: 'Arne Slot' });
  });

  it('parsePlayers flags substitutes via lineup subs', () => {
    const parsed = parsePlayers(content, new Map(), null);
    expect(parsed.get(920101)?.isSub).toBe(true); // away sub who played
    expect(parsed.get(700)?.isSub).toBe(true); // home sub who played
    expect(parsed.get(920102)?.isSub).toBe(false); // starter
  });
});
