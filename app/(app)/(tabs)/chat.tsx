import { useFocusEffect } from 'expo-router';
import { AtSign, Bell, BellOff, Check, MessagesSquare } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { EmptyState, Screen, Skeleton } from '@/components';
import { useSession } from '@/features/auth/session-context';
import {
  loadChatNotifications,
  markChatRead,
  setChatNotifications,
  type ChatNotificationPref,
} from '@/features/chat/api';
import { useChatBadge } from '@/features/chat/badge';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { MessageRow } from '@/features/chat/MessageRow';
import { useChat } from '@/features/chat/useChat';
import { computeReaders } from '@/features/chat/readers';
import { useReadReceipts } from '@/features/chat/useReadReceipts';
import type { ChatMember, ChatMessage } from '@/features/chat/types';
import { useThemeColors } from '@/theme';

// A gap longer than this between two messages shows a centered time divider.
const SILENCE_MS = 60 * 60 * 1000;

// Stable empty array so rows without readers don't get a new prop each render.
const EMPTY_READERS: ChatMember[] = [];

function separatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${date}  ${time}`;
}

type Meta = {
  groupStart: boolean;
  groupEnd: boolean;
  showTimeSeparator: boolean;
  separatorLabel: string;
};

const NOTIF_OPTIONS: { key: ChatNotificationPref; label: string; icon: typeof Bell }[] = [
  { key: 'all', label: 'All messages', icon: Bell },
  { key: 'mentions', label: 'Only mentions', icon: AtSign },
  { key: 'none', label: 'None', icon: BellOff },
];

export default function ChatScreen() {
  const c = useThemeColors();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { members, messages, loading, send, sendGif } = useChat();
  const setHasUnread = useChatBadge((s) => s.setHasUnread);

  const { readAt } = useReadReceipts();
  const listRef = useRef<FlatList>(null);
  const [revealedTimeId, setRevealedTimeId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const toggleTime = useCallback(
    (id: number) => setRevealedTimeId((prev) => (prev === id ? null : id)),
    []
  );

  const readersByMessage = useMemo(
    () => computeReaders(messages ?? [], members, readAt, userId),
    [messages, members, readAt, userId]
  );

  // Notification preference — read on its own (see loadChatNotifications).
  const [pref, setPref] = useState<ChatNotificationPref | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!userId) return;
    loadChatNotifications(userId).then(setPref);
  }, [userId]);

  const choosePref = useCallback(
    async (next: ChatNotificationPref) => {
      setMenuOpen(false);
      if (!userId || next === pref) return;
      const prev = pref;
      setPref(next);
      try {
        await setChatNotifications(userId, next);
      } catch {
        setPref(prev); // revert on failure
      }
    },
    [userId, pref]
  );

  // Mark read whenever the chat is on screen (clears the tab badge) and persist.
  const focused = useRef(false);
  const markSeen = useCallback(() => {
    setHasUnread(false);
    if (userId) markChatRead(userId, new Date().toISOString());
  }, [userId, setHasUnread]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      markSeen();
      return () => {
        focused.current = false;
        markSeen();
      };
    }, [markSeen])
  );

  const count = messages?.length ?? 0;
  useEffect(() => {
    if (focused.current) {
      setHasUnread(false);
      if (userId) markChatRead(userId, new Date().toISOString());
    }
  }, [count, setHasUnread, userId]);

  // Per-message grouping + silence dividers (computed oldest→newest), then
  // reversed for the inverted list.
  const data = useMemo(() => {
    if (!messages) return [];
    const withMeta = messages.map((m, i, arr) => {
      const prev = arr[i - 1];
      const next = arr[i + 1];
      const gap = prev
        ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()
        : Infinity;
      const showTimeSeparator = !prev || gap > SILENCE_MS;
      const groupStart = showTimeSeparator || !prev || prev.userId !== m.userId;
      // The last message of a consecutive same-author run (next is a different
      // author, separated by a silence divider, or this is the newest). The
      // avatar renders here (Messenger-style: at the bottom of the group).
      const nextGap = next
        ? new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()
        : Infinity;
      const groupEnd = !next || nextGap > SILENCE_MS || next.userId !== m.userId;
      const meta: Meta = {
        groupStart,
        groupEnd,
        showTimeSeparator,
        separatorLabel: separatorLabel(m.createdAt),
      };
      return { message: m, meta };
    });
    return withMeta.reverse();
  }, [messages]);

  const jumpTo = useCallback(
    (id: number) => {
      const idx = data.findIndex((d) => d.message.id === id);
      if (idx < 0) return;
      listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: true });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 900);
    },
    [data]
  );

  const BellIcon = pref === 'none' ? BellOff : pref === 'mentions' ? AtSign : Bell;

  return (
    <Screen glow="hype" edges={['top']}>
      <View
        className="flex-row items-center justify-between px-xl py-md"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border, zIndex: 10 }}
      >
        <Text className="text-2xl font-bold text-text">League chat</Text>
        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: c.surfaceRaised, opacity: pref === null ? 0.5 : 1 }}
          accessibilityLabel="Chat notification settings"
        >
          <BellIcon
            size={18}
            color={pref === 'none' ? c.textMuted : c.primary}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>

      {menuOpen ? (
        <>
          <Pressable
            onPress={() => setMenuOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}
          />
          <View
            style={{
              position: 'absolute',
              top: 58,
              right: 16,
              zIndex: 30,
              minWidth: 190,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.surfaceRaised,
              overflow: 'hidden',
            }}
          >
            {NOTIF_OPTIONS.map((opt) => {
              const OptIcon = opt.icon;
              const active = pref === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => choosePref(opt.key)}
                  className="flex-row items-center gap-sm px-md py-sm"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? c.surfaceGlass : 'transparent',
                  })}
                >
                  <OptIcon size={16} color={active ? c.primary : c.textMuted} strokeWidth={2.2} />
                  <Text
                    className="flex-1 text-base"
                    style={{ color: active ? c.text : c.textMuted, fontWeight: active ? '700' : '500' }}
                  >
                    {opt.label}
                  </Text>
                  {active ? <Check size={16} color={c.primary} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // 0, not a header offset: with behavior="padding" the KAV lifts the
        // composer using its absolute frame bottom, so any non-zero offset just
        // adds that many px of dead gap between the input and the keyboard.
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View className="gap-md px-xl py-xl">
            <Skeleton width="70%" height={40} radius={16} />
            <Skeleton width="55%" height={40} radius={16} />
            <Skeleton width="80%" height={40} radius={16} />
          </View>
        ) : data.length === 0 ? (
          <View className="flex-1 justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="No messages yet"
              message="Say hi to the league — everyone sees this chat."
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={data}
            inverted
            keyExtractor={(item) => String(item.message.id)}
            renderItem={({ item }: { item: { message: ChatMessage; meta: Meta } }) => (
              <MessageRow
                message={item.message}
                members={members}
                meId={userId}
                groupStart={item.meta.groupStart}
                groupEnd={item.meta.groupEnd}
                showTimeSeparator={item.meta.showTimeSeparator}
                separatorLabel={item.meta.separatorLabel}
                readers={readersByMessage.get(item.message.id) ?? EMPTY_READERS}
                showTime={revealedTimeId === item.message.id}
                onToggleTime={toggleTime}
                onReply={setReplyingTo}
                onJumpTo={jumpTo}
                highlighted={highlightedId === item.message.id}
              />
            )}
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollToIndexFailed={(info) => {
              // Variable row heights: approximate, then retry once laid out.
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  viewPosition: 0.5,
                  animated: true,
                });
              }, 250);
            }}
          />
        )}

        <ChatComposer
          members={members}
          onSend={(body) => {
            send(body, replyingTo?.id ?? null);
            setReplyingTo(null);
          }}
          onSendGif={(gif) => {
            sendGif(gif, replyingTo?.id ?? null);
            setReplyingTo(null);
          }}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
