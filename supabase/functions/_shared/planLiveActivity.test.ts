import { describe, expect, it } from 'vitest';

import type { ContentState } from './buildActivityState.ts';
import { planLiveActivity, type UserActivityInput } from './planLiveActivity.ts';

const NOW = Date.parse('2026-06-14T20:00:00Z');
const GRACE = 10 * 60_000;
const cs = (total: number): ContentState => ({
  layout: 'focused', totalPoints: total, updatedAt: 0, matches: [], players: [],
});

const base: Omit<UserActivityInput, 'contentState' | 'activities' | 'pushToStartToken'> = {
  userId: 'u1', env: 'prod',
};
const plan = (u: Partial<UserActivityInput>) =>
  planLiveActivity({
    users: [{ ...base, pushToStartToken: null, contentState: null, activities: [], ...u }],
    nowMs: NOW, endGraceMs: GRACE,
  });
const types = (actions: { type: string }[]) => actions.map((a) => a.type);

describe('planLiveActivity — start (exactly one, no retry)', () => {
  it('starts when relevant, has a token, and there is no activity at all', () => {
    const actions = plan({ pushToStartToken: 'PTS', contentState: cs(31), activities: [] });
    expect(types(actions)).toContain('start');
    const start = actions.find((a) => a.type === 'start') as any;
    expect(start).toMatchObject({ userId: 'u1', token: 'PTS', env: 'prod' });
  });

  it('does NOT start when a real (token-bearing) activity already exists', () => {
    const actions = plan({
      pushToStartToken: 'PTS', contentState: cs(31),
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: null, createdAtMs: NOW }],
    });
    expect(types(actions)).not.toContain('start');
  });

  it('does NOT re-start while a placeholder exists (push-to-start is not idempotent)', () => {
    const actions = plan({
      pushToStartToken: 'PTS', contentState: cs(31),
      // placeholder the device has not yet confirmed (e.g. app never opened)
      activities: [{ id: 'start:u1:d', token: null, endedPendingSince: null, createdAtMs: NOW - 60 * 60_000 }],
    });
    expect(types(actions)).not.toContain('start');
  });

  it('does not start without a push-to-start token', () => {
    const actions = plan({ pushToStartToken: null, contentState: cs(31), activities: [] });
    expect(types(actions)).not.toContain('start');
  });

  it('does not start when there is no relevant live match', () => {
    const actions = plan({ pushToStartToken: 'PTS', contentState: null, activities: [] });
    expect(types(actions)).not.toContain('start');
  });
});

describe('planLiveActivity — single-activity enforcement', () => {
  it('ends extra real activities, keeping one (max id), and updates only that one', () => {
    const actions = plan({
      contentState: cs(42),
      activities: [
        { id: 'act-1', token: 'T1', endedPendingSince: null, createdAtMs: NOW },
        { id: 'act-2', token: 'T2', endedPendingSince: null, createdAtMs: NOW - 5000 },
      ],
    });
    const ends = actions.filter((a) => a.type === 'end') as any[];
    const updates = actions.filter((a) => a.type === 'update') as any[];
    expect(ends.map((e) => e.activityId)).toEqual(['act-1']); // max id 'act-2' kept
    expect(updates.map((u) => u.activityId)).toEqual(['act-2']);
  });

  it('drops leftover placeholders once a real activity exists', () => {
    const actions = plan({
      contentState: cs(42),
      activities: [
        { id: 'NEW', token: 'TNEW', endedPendingSince: null, createdAtMs: NOW },
        { id: 'start:u1:d', token: null, endedPendingSince: null, createdAtMs: NOW - 1000 },
      ],
    });
    expect(types(actions)).toContain('drop-placeholder');
    expect(types(actions)).not.toContain('start');
  });
});

describe('planLiveActivity — update', () => {
  it('updates the activity that has a token while a match is relevant', () => {
    const actions = plan({
      contentState: cs(42),
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: null, createdAtMs: NOW }],
    });
    const update = actions.find((a) => a.type === 'update') as any;
    expect(update).toMatchObject({ activityId: 'ACT1', token: 'TOK1' });
    expect(update.contentState.totalPoints).toBe(42);
  });

  it('clears a pending-end when a match becomes relevant again', () => {
    const actions = plan({
      contentState: cs(42),
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: NOW - 1000, createdAtMs: NOW }],
    });
    expect(types(actions)).toEqual(expect.arrayContaining(['update', 'clear-end-pending']));
  });
});

describe('planLiveActivity — end / cleanup', () => {
  it('marks end-pending (does not end yet) the first cycle with no relevant match', () => {
    const actions = plan({
      contentState: null,
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: null, createdAtMs: NOW }],
    });
    expect(types(actions)).toContain('mark-end-pending');
    expect(types(actions)).not.toContain('end');
  });

  it('waits out the grace window before ending', () => {
    const actions = plan({
      contentState: null,
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: NOW - (GRACE - 1000), createdAtMs: NOW }],
    });
    expect(types(actions)).not.toContain('end');
  });

  it('ends once the grace window has passed', () => {
    const actions = plan({
      contentState: null,
      activities: [{ id: 'ACT1', token: 'TOK1', endedPendingSince: NOW - (GRACE + 1000), createdAtMs: NOW }],
    });
    const end = actions.find((a) => a.type === 'end') as any;
    expect(end).toMatchObject({ activityId: 'ACT1', token: 'TOK1' });
  });

  it('drops a placeholder (no token) immediately when no match is relevant', () => {
    const actions = plan({
      contentState: null,
      activities: [{ id: 'start:u1:d', token: null, endedPendingSince: null, createdAtMs: NOW }],
    });
    expect(types(actions)).toContain('drop-placeholder');
    expect(types(actions)).not.toContain('end');
  });
});
