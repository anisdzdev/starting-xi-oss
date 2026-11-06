import type { ChatMember, ChatMessage } from './types';

/**
 * Messenger-style group read indicators. For each member (except `meId`), finds
 * their read high-water mark — the newest message whose `createdAt` is at or
 * before their `last_read_at` — and buckets them under that message id.
 *
 * @param messages oldest -> newest (the useChat ordering)
 * @param readAt   userId -> last_read_at ISO string
 * @returns Map<messageId, ChatMember[]> (readers to render beneath that message)
 */
export function computeReaders(
  messages: ChatMessage[],
  members: ChatMember[],
  readAt: Map<string, string>,
  meId: string | null
): Map<number, ChatMember[]> {
  const result = new Map<number, ChatMember[]>();
  if (messages.length === 0) return result;
  const byId = new Map(members.map((m) => [m.id, m]));

  for (const [userId, lastRead] of readAt) {
    if (userId === meId) continue;
    const member = byId.get(userId);
    if (!member) continue;

    // messages are sorted ascending, so the last one satisfying the predicate is
    // the high-water mark; break as soon as we pass it.
    let hw: ChatMessage | null = null;
    for (const m of messages) {
      if (m.createdAt <= lastRead) hw = m;
      else break;
    }
    if (!hw) continue;

    const arr = result.get(hw.id);
    if (arr) arr.push(member);
    else result.set(hw.id, [member]);
  }
  return result;
}
