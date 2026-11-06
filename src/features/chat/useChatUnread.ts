import { useEffect } from 'react';

import { useSession } from '@/features/auth/session-context';
import { getSupabase } from '@/lib/supabase';

import { hasUnreadSince, loadLastReadAt } from './api';
import { useChatBadge } from './badge';

/**
 * Watches for unseen chat messages and drives the tab badge. Mounted once in the
 * tab bar. On mount it computes the initial unread state from the user's
 * last-read timestamp, then subscribes to new messages: any message from someone
 * else marks the chat unread. The chat screen clears the flag when it opens.
 */
export function useChatUnreadWatcher(): boolean {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const hasUnread = useChatBadge((s) => s.hasUnread);
  const setHasUnread = useChatBadge((s) => s.setHasUnread);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const since = await loadLastReadAt(userId);
      if (cancelled) return;
      const unread = await hasUnreadSince(userId, since);
      if (!cancelled && unread) setHasUnread(true);
    })();

    const channel = getSupabase()
      .channel(`chat-badge-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = payload.new as { user_id?: string };
          if (row?.user_id && row.user_id !== userId) setHasUnread(true);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, [userId, setHasUnread]);

  return hasUnread;
}
