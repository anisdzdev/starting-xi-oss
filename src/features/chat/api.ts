import { getSupabase } from '@/lib/supabase';

import type { ChatMember, ChatMessage } from './types';

// NOTE: we intentionally do NOT embed the replied-to message via a PostgREST
// self-join (`reply_to:chat_messages!...`) — that shape 400s (self-embed + nested
// profiles is fragile / schema-cache sensitive). We select the scalar `reply_to_id`
// and resolve the quote preview client-side from the already-loaded messages +
// members (see resolveReplyPreview in useChat).
const MESSAGE_SELECT =
  'id, user_id, body, mentions, gif_url, gif_width, gif_height, created_at, reply_to_id, ' +
  'author:profiles!chat_messages_user_id_fkey(id, display_name, avatar_url)';

type RawMessage = {
  id: number;
  user_id: string;
  body: string | null;
  mentions: string[] | null;
  gif_url: string | null;
  gif_width: number | null;
  gif_height: number | null;
  created_at: string;
  reply_to_id: number | null;
  author: { id: string; display_name: string; avatar_url: string | null } | null;
};

function toMessage(r: RawMessage): ChatMessage {
  return {
    id: r.id,
    userId: r.user_id,
    body: r.body ?? '',
    mentions: r.mentions ?? [],
    gifUrl: r.gif_url,
    gifWidth: r.gif_width,
    gifHeight: r.gif_height,
    createdAt: r.created_at,
    author: r.author
      ? { id: r.author.id, name: r.author.display_name, avatarUrl: r.author.avatar_url }
      : null,
    replyToId: r.reply_to_id,
    replyTo: null, // resolved client-side (see useChat)
  };
}

/** Every profile that can post / be mentioned (name + avatar), name-sorted. */
export async function loadChatMembers(): Promise<ChatMember[]> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('id, display_name, avatar_url')
    .order('display_name');
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.display_name as string,
    avatarUrl: (p.avatar_url as string | null) ?? null,
  }));
}

/** Most recent messages, returned oldest → newest. */
export async function loadRecentMessages(limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.warn('[chat] loadRecentMessages failed:', error.message);
  return ((data ?? []) as unknown as RawMessage[]).map(toMessage).reverse();
}

/** Fetch a single message with its author (used to resolve realtime inserts). */
export async function loadMessage(id: number): Promise<ChatMessage | null> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .select(MESSAGE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) console.warn('[chat] loadMessage failed:', error.message);
  return data ? toMessage(data as unknown as RawMessage) : null;
}

/** Insert a message as the given user and return it (author + reply resolved). */
export async function sendChatMessage(
  userId: string,
  body: string,
  mentions: string[],
  replyToId: number | null = null
): Promise<ChatMessage | null> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .insert({ user_id: userId, body, mentions, reply_to_id: replyToId })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? toMessage(data as unknown as RawMessage) : null;
}

/** Insert a GIF message (reference only: url + dimensions, no bytes). */
export async function sendChatGif(
  userId: string,
  gif: { url: string; width: number; height: number },
  replyToId: number | null = null
): Promise<ChatMessage | null> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .insert({
      user_id: userId,
      body: null,
      mentions: [],
      gif_url: gif.url,
      gif_width: gif.width,
      gif_height: gif.height,
      reply_to_id: replyToId,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? toMessage(data as unknown as RawMessage) : null;
}

/** Ping send-push so everyone with the toggle on gets a notification. Best-effort. */
export async function notifyChatMessage(messageId: number): Promise<void> {
  await getSupabase()
    .functions.invoke('send-push', { body: { kind: 'chat', message_id: messageId } })
    .catch(() => undefined);
}

/** Stamp the chat as read up to now for this user (clears the unread badge). */
export async function markChatRead(userId: string, at: string): Promise<void> {
  await getSupabase()
    .from('chat_read_state')
    .upsert({ user_id: userId, last_read_at: at }, { onConflict: 'user_id' });
}

export async function loadLastReadAt(userId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('chat_read_state')
    .select('last_read_at')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.last_read_at as string | null) ?? null;
}

/** Whether any message from someone else exists after `since` (null = ever). */
export async function hasUnreadSince(userId: string, since: string | null): Promise<boolean> {
  let q = getSupabase()
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .neq('user_id', userId);
  if (since) q = q.gt('created_at', since);
  const { count } = await q;
  return (count ?? 0) > 0;
}

export type ChatNotificationPref = 'all' | 'mentions' | 'none';

/**
 * The user's chat-notification preference. Read on its own (NOT via the
 * auth-critical session profile select) so a missing column — e.g. client
 * shipped before the migration — can't break login; it just defaults to 'all'.
 */
export async function loadChatNotifications(userId: string): Promise<ChatNotificationPref> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('chat_notifications')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return 'all';
  return ((data.chat_notifications as ChatNotificationPref | null) ?? 'all');
}

export async function setChatNotifications(
  userId: string,
  pref: ChatNotificationPref
): Promise<void> {
  const { error } = await getSupabase()
    .from('profiles')
    .update({ chat_notifications: pref })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
