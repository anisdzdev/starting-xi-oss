import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/**
 * Every member's chat read position (userId -> last_read_at ISO), kept live via
 * Realtime on chat_read_state. Read-all is allowed by RLS (friends-only league).
 * Feeds computeReaders() to place read-indicator avatars. The channel name is
 * instance-unique so multiple mounts don't clash (same pattern as useChat).
 */
export function useReadReceipts() {
  const [readAt, setReadAt] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from('chat_read_state')
        .select('user_id, last_read_at');
      if (cancelled || !data) return;
      setReadAt(
        new Map(data.map((r) => [r.user_id as string, r.last_read_at as string]))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`chat-read-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_read_state' },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_at?: string };
          if (!row?.user_id || !row.last_read_at) return;
          setReadAt((prev) => {
            const next = new Map(prev);
            next.set(row.user_id as string, row.last_read_at as string);
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, []);

  return { readAt };
}
