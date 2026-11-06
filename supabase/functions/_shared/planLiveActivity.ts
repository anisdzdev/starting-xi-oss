/**
 * Decide which Live Activity pushes/DB writes to make this cycle.
 *
 * Pure & dependency-free (no Deno/DB) so the lifecycle logic — the error-prone
 * part — is fully unit-tested. The edge function gathers DB state, builds each
 * user's ContentState with buildActivityState, calls this planner, then executes
 * the returned actions (APNs + DB).
 *
 * EXACTLY ONE activity per user. Push-to-start is NOT idempotent — every start
 * push spawns a new activity — so we:
 *  - START only when the user has NO activity at all (no placeholder, no running
 *    one). We never "retry" a start: a placeholder (inserted by the executor only
 *    after a successful start push) blocks further starts until the device
 *    confirms (replacing it with a real row) or the match ends. Retrying would
 *    create duplicates whenever the app isn't opened to confirm the activity.
 *  - If the DB ever shows >1 running activity, keep one deterministically (max
 *    activity id) and END the rest. The app uses the SAME max-id rule for its
 *    on-device dedup, so the two never disagree about which to keep.
 *  - UPDATE the (single) running activity while a match is relevant.
 *  - END after a grace window once no match is relevant; placeholders are dropped.
 */

import type { ContentState } from './buildActivityState.ts';

export interface ActivityRow {
  id: string;
  token: string | null;
  endedPendingSince: number | null; // epoch ms
  createdAtMs: number | null; // epoch ms (started_at) — currently informational
}

export interface UserActivityInput {
  userId: string;
  env: 'prod' | 'sandbox';
  pushToStartToken: string | null;
  contentState: ContentState | null;
  activities: ActivityRow[];
}

export interface PlanInput {
  users: UserActivityInput[];
  nowMs: number;
  endGraceMs?: number;
}

export type Action =
  | { type: 'start'; userId: string; token: string; env: 'prod' | 'sandbox'; contentState: ContentState }
  | { type: 'update'; userId: string; activityId: string; token: string; env: 'prod' | 'sandbox'; contentState: ContentState }
  | { type: 'end'; userId: string; activityId: string; token: string; env: 'prod' | 'sandbox'; contentState: ContentState | null }
  | { type: 'mark-end-pending'; userId: string; activityId: string; sinceMs: number }
  | { type: 'clear-end-pending'; userId: string; activityId: string }
  | { type: 'drop-placeholder'; userId: string; activityId: string };

const DEFAULT_GRACE_MS = 10 * 60_000;

// Deterministic survivor: max activity id. The app uses the same rule on-device.
const byIdDesc = (a: ActivityRow, b: ActivityRow) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function planLiveActivity(input: PlanInput): Action[] {
  const grace = input.endGraceMs ?? DEFAULT_GRACE_MS;
  const actions: Action[] = [];

  for (const u of input.users) {
    const real = u.activities.filter((a) => a.token).sort(byIdDesc);
    const placeholders = u.activities.filter((a) => !a.token);

    if (u.contentState != null) {
      const state = u.contentState;

      if (real.length > 0) {
        const [keep, ...extras] = real;
        // collapse to one: end any duplicates, keep the newest
        for (const extra of extras) {
          actions.push({ type: 'end', userId: u.userId, activityId: extra.id, token: extra.token!, env: u.env, contentState: state });
        }
        actions.push({ type: 'update', userId: u.userId, activityId: keep.id, token: keep.token!, env: u.env, contentState: state });
        if (keep.endedPendingSince != null) {
          actions.push({ type: 'clear-end-pending', userId: u.userId, activityId: keep.id });
        }
        // a confirmed activity makes the placeholder redundant
        for (const p of placeholders) {
          actions.push({ type: 'drop-placeholder', userId: u.userId, activityId: p.id });
        }
      } else if (u.pushToStartToken && u.activities.length === 0) {
        // no activity AND no placeholder → safe to start (executor inserts the
        // placeholder only on push success). A lingering placeholder blocks this.
        actions.push({ type: 'start', userId: u.userId, token: u.pushToStartToken, env: u.env, contentState: state });
      }
      continue;
    }

    // no relevant live match → wind down
    for (const a of real) {
      if (a.endedPendingSince == null) {
        actions.push({ type: 'mark-end-pending', userId: u.userId, activityId: a.id, sinceMs: input.nowMs });
      } else if (input.nowMs - a.endedPendingSince >= grace) {
        actions.push({ type: 'end', userId: u.userId, activityId: a.id, token: a.token!, env: u.env, contentState: u.contentState });
      }
    }
    for (const p of placeholders) {
      actions.push({ type: 'drop-placeholder', userId: u.userId, activityId: p.id });
    }
  }

  return actions;
}
