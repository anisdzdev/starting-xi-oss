import { describe, expect, it } from 'vitest';

import { computeReaders } from './readers';
import type { ChatMember, ChatMessage } from './types';

const members: ChatMember[] = [
  { id: 'me', name: 'Me', avatarUrl: null },
  { id: 'a', name: 'Ada', avatarUrl: null },
  { id: 'b', name: 'Ben', avatarUrl: null },
];

function msg(id: number, createdAt: string): ChatMessage {
  return {
    id,
    userId: 'me',
    body: `m${id}`,
    mentions: [],
    gifUrl: null,
    gifWidth: null,
    gifHeight: null,
    createdAt,
    author: null,
    replyToId: null,
    replyTo: null,
  };
}

// oldest -> newest, matching the useChat `messages` ordering
const messages = [
  msg(1, '2026-07-03T10:00:00Z'),
  msg(2, '2026-07-03T10:05:00Z'),
  msg(3, '2026-07-03T10:10:00Z'),
];

describe('computeReaders', () => {
  it('returns an empty map when nobody has read', () => {
    const r = computeReaders(messages, members, new Map(), 'me');
    expect(r.size).toBe(0);
  });

  it('places each reader on their high-water message (newest read)', () => {
    const readAt = new Map([
      ['a', '2026-07-03T10:06:00Z'], // read through m2
      ['b', '2026-07-03T10:12:00Z'], // read through m3
    ]);
    const r = computeReaders(messages, members, readAt, 'me');
    expect(r.get(2)?.map((m) => m.id)).toEqual(['a']);
    expect(r.get(3)?.map((m) => m.id)).toEqual(['b']);
    expect(r.get(1)).toBeUndefined();
  });

  it('stacks multiple readers caught up to the same message', () => {
    const readAt = new Map([
      ['a', '2026-07-03T10:11:00Z'],
      ['b', '2026-07-03T10:11:00Z'],
    ]);
    const r = computeReaders(messages, members, readAt, 'me');
    expect(r.get(3)?.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes the current user and unknown members', () => {
    const readAt = new Map([
      ['me', '2026-07-03T10:11:00Z'],
      ['ghost', '2026-07-03T10:11:00Z'],
      ['a', '2026-07-03T10:11:00Z'],
    ]);
    const r = computeReaders(messages, members, readAt, 'me');
    expect(r.get(3)?.map((m) => m.id)).toEqual(['a']);
  });

  it('ignores a reader whose last_read predates every message', () => {
    const readAt = new Map([['a', '2026-07-03T09:00:00Z']]);
    const r = computeReaders(messages, members, readAt, 'me');
    expect(r.size).toBe(0);
  });
});
