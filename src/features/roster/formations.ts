import type { Position } from '@/shared/scoring';

/** Mirrors the `formations` table seed (migration 20260611190000). */
export type Formation = { code: string; def: number; mid: number; fwd: number };

export const FORMATIONS: Formation[] = [
  { code: '3-4-3', def: 3, mid: 4, fwd: 3 },
  { code: '3-5-2', def: 3, mid: 5, fwd: 2 },
  { code: '4-3-3', def: 4, mid: 3, fwd: 3 },
  { code: '4-4-2', def: 4, mid: 4, fwd: 2 },
  { code: '4-5-1', def: 4, mid: 5, fwd: 1 },
  { code: '5-2-3', def: 5, mid: 2, fwd: 3 },
  { code: '5-3-2', def: 5, mid: 3, fwd: 2 },
  { code: '5-4-1', def: 5, mid: 4, fwd: 1 },
];

export function getFormation(code: string): Formation {
  const f = FORMATIONS.find((x) => x.code === code);
  if (!f) throw new Error(`Unknown formation: ${code}`);
  return f;
}

/**
 * Position required by each slot, index 0 = slot 1 (matches
 * roster_players.slot_position 1–11): GK first, then DEF, MID, FWD.
 */
export function slotPositionList(code: string): Position[] {
  const f = getFormation(code);
  return [
    'GK',
    ...Array<Position>(f.def).fill('DEF'),
    ...Array<Position>(f.mid).fill('MID'),
    ...Array<Position>(f.fwd).fill('FWD'),
  ];
}

export type SlotPoint = { slot: number; position: Position; x: number; y: number };

/** Vertical placement of each line on the pitch (percent from top; GK at the bottom). */
const LINE_Y: Record<Position, number> = { FWD: 12, MID: 36, DEF: 62, GK: 85 };

/**
 * Slot coordinates as percentages of the pitch container.
 * Players in a line spread evenly; lines sit at natural pitch depths.
 */
export function slotLayout(code: string): SlotPoint[] {
  return layoutFromPositions(slotPositionList(code));
}

/**
 * Layout for an arbitrary list of positions (index-aligned with the input) —
 * robust for partial rosters that don't match a known formation.
 */
export function layoutFromPositions(positions: Position[]): SlotPoint[] {
  const byLine = new Map<Position, number[]>();
  positions.forEach((pos, i) => {
    byLine.set(pos, [...(byLine.get(pos) ?? []), i + 1]);
  });

  const points: SlotPoint[] = [];
  for (const [position, slots] of byLine) {
    slots.forEach((slot, i) => {
      points.push({
        slot,
        position,
        x: ((i + 1) / (slots.length + 1)) * 100,
        y: LINE_Y[position],
      });
    });
  }
  return points.sort((a, b) => a.slot - b.slot);
}
