import { create } from 'zustand';

import type { Position } from '@/shared/scoring';

import { slotPositionList } from './formations';

export type PickedPlayer = {
  id: number; // players.id
  name: string;
  position: Position;
  imageUrl: string | null;
  teamCode: string;
  flagUrl: string | null;
};

type RosterBuilderState = {
  formationCode: string | null;
  /** index = slot_position - 1 (0 is always GK). */
  slots: (PickedPlayer | null)[];
  /** Reassignment tray: picked players whose position no longer fits the formation. */
  bench: PickedPlayer[];
  captainId: number | null;

  setFormation: (code: string) => void;
  assign: (slot: number, player: PickedPlayer) => void;
  clearSlot: (slot: number) => void;
  /** Bench tray tap: place into the first free slot matching the player's position. */
  placeFromBench: (playerId: number) => void;
  setCaptain: (playerId: number | null) => void;
  /** Replace the whole builder state from a saved roster. */
  hydrate: (
    formationCode: string,
    players: { slot: number; player: PickedPlayer }[],
    captainId: number | null
  ) => void;
  reset: () => void;
};

const EMPTY_SLOTS = () => Array<PickedPlayer | null>(11).fill(null);

export const useRosterBuilder = create<RosterBuilderState>((set, get) => ({
  formationCode: null,
  slots: EMPTY_SLOTS(),
  bench: [],
  captainId: null,

  /**
   * Selecting/switching formation re-seats everyone (current XI + bench) into
   * the new shape: players keep a slot wherever their position still fits;
   * overflow players land on the bench tray for manual reassignment.
   */
  setFormation: (code) => {
    const positions = slotPositionList(code);
    const everyone = [
      ...(get().slots.filter(Boolean) as PickedPlayer[]),
      ...get().bench,
    ];
    const slots = EMPTY_SLOTS();
    const bench: PickedPlayer[] = [];
    for (const player of everyone) {
      const idx = positions.findIndex((pos, i) => pos === player.position && slots[i] === null);
      if (idx >= 0) slots[idx] = player;
      else bench.push(player);
    }
    set({ formationCode: code, slots, bench });
  },

  assign: (slot, player) => {
    const positions = slotPositionList(get().formationCode ?? '4-4-2');
    if (positions[slot - 1] !== player.position) return; // wrong line — ignore
    const slots = [...get().slots];
    slots[slot - 1] = player;
    set({
      slots,
      bench: get().bench.filter((p) => p.id !== player.id),
    });
  },

  clearSlot: (slot) => {
    const slots = [...get().slots];
    const removed = slots[slot - 1];
    slots[slot - 1] = null;
    set({
      slots,
      captainId: get().captainId === removed?.id ? null : get().captainId,
    });
  },

  placeFromBench: (playerId) => {
    const player = get().bench.find((p) => p.id === playerId);
    const code = get().formationCode;
    if (!player || !code) return;
    const positions = slotPositionList(code);
    const idx = positions.findIndex(
      (pos, i) => pos === player.position && get().slots[i] === null
    );
    if (idx < 0) return; // no free slot for this line
    get().assign(idx + 1, player);
  },

  setCaptain: (playerId) => set({ captainId: playerId }),

  hydrate: (formationCode, players, captainId) => {
    const slots = EMPTY_SLOTS();
    for (const { slot, player } of players) {
      if (slot >= 1 && slot <= 11) slots[slot - 1] = player;
    }
    set({ formationCode, slots, bench: [], captainId });
  },

  reset: () => set({ formationCode: null, slots: EMPTY_SLOTS(), bench: [], captainId: null }),
}));

/** Convenience selectors. */
export const selectPickedCount = (s: RosterBuilderState) =>
  s.slots.filter(Boolean).length;
export const selectSlotPosition =
  (slot: number) =>
  (s: RosterBuilderState): Position | null =>
    s.formationCode ? slotPositionList(s.formationCode)[slot - 1] : null;
