import type { ChatMember, ChatMessage, ChatReplyPreview } from './types';

/**
 * Build a reply's quote preview from the already-loaded messages + members. We
 * do NOT embed the quoted message in the PostgREST query (a self-join 400s and is
 * schema-cache sensitive), so replies carry only a scalar `replyToId` and the
 * preview is resolved here. Returns null when the id is absent or the quoted
 * message isn't in the loaded window (rare; the quote just doesn't render).
 */
export function resolveReplyPreview(
  replyToId: number | null,
  pool: ChatMessage[],
  members: ChatMember[]
): ChatReplyPreview | null {
  if (replyToId == null) return null;
  const orig = pool.find((m) => m.id === replyToId);
  if (!orig) return null;
  const author = members.find((m) => m.id === orig.userId);
  return {
    id: orig.id,
    authorName: orig.author?.name ?? author?.name ?? 'Player',
    body: orig.body,
    isGif: !!orig.gifUrl,
    gifUrl: orig.gifUrl,
  };
}
