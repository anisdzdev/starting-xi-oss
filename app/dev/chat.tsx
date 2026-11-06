import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Screen } from '@/components';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { MessageRow } from '@/features/chat/MessageRow';
import { computeReaders } from '@/features/chat/readers';
import type { ChatMember, ChatMessage } from '@/features/chat/types';

// Dev-only: renders the chat UI with mock data (no auth / Supabase) so read
// indicators, replies (swipe + quote), and the animated time reveal can be
// eyeballed. __DEV__-guarded in the root layout.

const ME = 'me';

const members: ChatMember[] = [
  { id: 'me', name: 'You', avatarUrl: null },
  { id: 'a', name: 'Anis', avatarUrl: null },
  { id: 'r', name: 'Rival Rik', avatarUrl: null },
  { id: 'k', name: 'Karim', avatarUrl: null },
  { id: 's', name: 'Sofia', avatarUrl: null },
];

const base = { gifUrl: null, gifWidth: null, gifHeight: null, replyToId: null, replyTo: null } as const;

const messages: ChatMessage[] = [
  {
    id: 1,
    userId: 'a',
    body: 'Who is everyone captaining today?',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:00:00Z',
    author: members[1],
  },
  {
    id: 2,
    userId: 'r',
    body: 'Going with Mbappé. @Anis you in?',
    mentions: ['a'],
    ...base,
    createdAt: '2026-07-02T18:01:00Z',
    author: members[2],
  },
  {
    id: 3,
    userId: 'me',
    body: 'Captaining Bellingham, no contest',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:02:00Z',
    author: members[0],
    replyToId: 2,
    replyTo: {
      id: 2,
      authorName: 'Rival Rik',
      body: 'Going with Mbappé. @Anis you in?',
      isGif: false,
      gifUrl: null,
    },
  },
  {
    id: 4,
    userId: 'k',
    body: 'lineups are in!',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:03:00Z',
    author: members[3],
  },
  // Second consecutive Karim message — the avatar must sit on THIS one (group end),
  // with the name only above message 4 (group start).
  {
    id: 8,
    userId: 'k',
    body: 'who is starting up top?',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:03:20Z',
    author: members[3],
  },
  // Short own message — must stay on ONE line (repro for the bubble-collapse bug).
  {
    id: 5,
    userId: 'me',
    body: 'nf yn',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:04:00Z',
    author: members[0],
  },
  // Long own message — should wrap at ~80% width, right-aligned.
  {
    id: 6,
    userId: 'me',
    body: 'this is a much longer message that should wrap onto multiple lines but stay within about eighty percent of the width',
    mentions: [],
    ...base,
    createdAt: '2026-07-02T18:04:30Z',
    author: members[0],
  },
  // Own GIF — must be right-aligned and fully on-screen (repro for the cutoff bug).
  {
    id: 7,
    userId: 'me',
    body: '',
    mentions: [],
    ...base,
    gifUrl: 'https://media1.tenor.com/m/placeholder/jerry.gif',
    gifWidth: 220,
    gifHeight: 220,
    createdAt: '2026-07-02T18:05:00Z',
    author: members[0],
  },
];

// Anis + Sofia read through m3; Karim read everything (m4).
const readAt = new Map<string, string>([
  ['a', '2026-07-02T18:02:30Z'],
  ['s', '2026-07-02T18:02:30Z'],
  ['k', '2026-07-02T18:03:30Z'],
]);

export default function ChatDev() {
  const data = useMemo(() => [...messages].reverse(), []);
  const readers = useMemo(() => computeReaders(messages, members, readAt, ME), []);
  const [revealedTimeId, setRevealedTimeId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  return (
    <Screen glow="hype" edges={['top']}>
      <FlatList
        data={data}
        inverted
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item, index }) => (
          <MessageRow
            message={item}
            members={members}
            meId={ME}
            groupStart={index === data.length - 1 || data[index + 1]?.userId !== item.userId}
            groupEnd={index === 0 || data[index - 1]?.userId !== item.userId}
            showTimeSeparator={index === data.length - 1}
            separatorLabel="10:30 AM"
            readers={readers.get(item.id) ?? []}
            showTime={revealedTimeId === item.id}
            onToggleTime={(id) => setRevealedTimeId((prev) => (prev === id ? null : id))}
            onReply={setReplyingTo}
            onJumpTo={() => {}}
            highlighted={false}
          />
        )}
        contentContainerStyle={{ paddingVertical: 12 }}
      />
      <ChatComposer
        members={members}
        onSend={() => setReplyingTo(null)}
        onSendGif={() => setReplyingTo(null)}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
      <View style={{ height: 8 }} />
    </Screen>
  );
}
