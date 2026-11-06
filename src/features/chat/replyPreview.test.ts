import { describe, expect, it } from 'vitest';

import { resolveReplyPreview } from './replyPreview';
import type { ChatMember, ChatMessage } from './types';

const members: ChatMember[] = [
  { id: 'a', name: 'Ada', avatarUrl: null },
  { id: 'b', name: 'Ben', avatarUrl: null },
];

function msg(over: Partial<ChatMessage> & { id: number }): ChatMessage {
  return {
    id: over.id,
    userId: over.userId ?? 'a',
    body: over.body ?? '',
    mentions: [],
    gifUrl: over.gifUrl ?? null,
    gifWidth: null,
    gifHeight: null,
    createdAt: '2026-07-03T10:00:00Z',
    author: over.author ?? null,
    replyToId: over.replyToId ?? null,
    replyTo: null,
  };
}

const pool: ChatMessage[] = [
  msg({ id: 1, userId: 'a', body: 'first', author: { id: 'a', name: 'Ada', avatarUrl: null } }),
  msg({ id: 2, userId: 'b', body: '', gifUrl: 'https://cdn/g.gif' }),
];

describe('resolveReplyPreview', () => {
  it('returns null when there is no reply target', () => {
    expect(resolveReplyPreview(null, pool, members)).toBeNull();
  });

  it('returns null when the quoted message is outside the loaded window', () => {
    expect(resolveReplyPreview(999, pool, members)).toBeNull();
  });

  it('resolves a text quote, preferring the message author name', () => {
    expect(resolveReplyPreview(1, pool, members)).toEqual({
      id: 1,
      authorName: 'Ada',
      body: 'first',
      isGif: false,
      gifUrl: null,
    });
  });

  it('falls back to the members list for the author name', () => {
    // message 2 has no embedded author; name comes from members (userId 'b' → Ben)
    const r = resolveReplyPreview(2, pool, members);
    expect(r?.authorName).toBe('Ben');
  });

  it('marks a GIF-only quote as a gif with its url', () => {
    const r = resolveReplyPreview(2, pool, members);
    expect(r?.isGif).toBe(true);
    expect(r?.gifUrl).toBe('https://cdn/g.gif');
  });
});
