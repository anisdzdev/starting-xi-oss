import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

import {
  loadChatMembers,
  loadMessage,
  loadRecentMessages,
  notifyChatMessage,
  sendChatGif,
  sendChatMessage,
} from './api';
import type { Gif } from './klipy';
import { extractMentions } from './mentions';
import { resolveReplyPreview } from './replyPreview';
import type { ChatMember, ChatMessage } from './types';

/**
 * The global group chat: initial load of members + recent messages, Supabase
 * Realtime on inserts (deduped by id so our own optimistic append doesn't
 * double), and a `send` that stores the message, resolves @-mentions, and pings
 * send-push. Messages are held oldest → newest. Reply quote previews are resolved
 * client-side (see resolveReplyPreview).
 */
export function useChat() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [members, setMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const membersRef = useRef<ChatMember[]>([]);

  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const list = prev ?? [];
      if (list.some((m) => m.id === msg.id)) return list;
      // Resolve the reply quote against what's already loaded + known members.
      const resolved: ChatMessage = {
        ...msg,
        replyTo: msg.replyTo ?? resolveReplyPreview(msg.replyToId, list, membersRef.current),
      };
      return [...list, resolved].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mem, msgs] = await Promise.all([loadChatMembers(), loadRecentMessages()]);
      if (cancelled) return;
      membersRef.current = mem;
      setMembers(mem);
      // Resolve each reply's quote against the freshly loaded batch.
      setMessages(msgs.map((m) => ({ ...m, replyTo: resolveReplyPreview(m.replyToId, msgs, mem) })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- realtime: new messages ----
  useEffect(() => {
    const channel = getSupabase()
      .channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new as {
            id: number;
            user_id: string;
            body: string | null;
            mentions: string[] | null;
            gif_url: string | null;
            gif_width: number | null;
            gif_height: number | null;
            reply_to_id: number | null;
            created_at: string;
          };
          if (!row?.id) return;
          const author = membersRef.current.find((m) => m.id === row.user_id) ?? null;
          // Known author → build inline; upsertMessage resolves any reply quote
          // from what's already loaded. Unknown sender (joined since we loaded
          // members) → fetch the row for its author and refresh the members list.
          if (author) {
            upsertMessage({
              id: row.id,
              userId: row.user_id,
              body: row.body ?? '',
              mentions: row.mentions ?? [],
              gifUrl: row.gif_url ?? null,
              gifWidth: row.gif_width ?? null,
              gifHeight: row.gif_height ?? null,
              createdAt: row.created_at,
              author,
              replyToId: row.reply_to_id ?? null,
              replyTo: null,
            });
          } else {
            loadMessage(row.id).then((m) => {
              if (m) upsertMessage(m);
            });
            loadChatMembers().then((mem) => {
              membersRef.current = mem;
              setMembers(mem);
            });
          }
        }
      )
      .subscribe();
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [upsertMessage]);

  // ---- refetch on return to foreground ----
  // iOS suspends the realtime websocket while backgrounded and missed INSERTs are
  // not replayed on reconnect, so messages that arrived while away wouldn't show
  // until a cold start (this also fires when opening from a notification). Pull the
  // recent messages and merge them (upsert dedupes by id, so no flicker).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      loadRecentMessages().then((msgs) => {
        for (const m of msgs) {
          upsertMessage({
            ...m,
            replyTo: resolveReplyPreview(m.replyToId, msgs, membersRef.current),
          });
        }
      });
    });
    return () => sub.remove();
  }, [upsertMessage]);

  const send = useCallback(
    async (body: string, replyToId: number | null = null) => {
      const trimmed = body.trim();
      if (!trimmed || !userId) return;
      const mentions = extractMentions(trimmed, membersRef.current);
      const msg = await sendChatMessage(userId, trimmed, mentions, replyToId);
      if (msg) {
        upsertMessage(msg); // instant local echo (reply resolved server-side); realtime dedupes by id
        notifyChatMessage(msg.id);
      }
    },
    [userId, upsertMessage]
  );

  const sendGif = useCallback(
    async (gif: Gif, replyToId: number | null = null) => {
      if (!userId) return;
      const msg = await sendChatGif(
        userId,
        { url: gif.url, width: gif.width, height: gif.height },
        replyToId
      );
      if (msg) {
        upsertMessage(msg);
        notifyChatMessage(msg.id);
      }
    },
    [userId, upsertMessage]
  );

  return {
    userId,
    members,
    messages,
    loading: messages === null,
    send,
    sendGif,
  };
}
