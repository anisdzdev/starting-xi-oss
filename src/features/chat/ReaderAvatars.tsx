import { Text, View } from 'react-native';

import { Avatar } from '@/components';
import { useThemeColors } from '@/theme';

import type { ChatMember } from './types';

const SIZE = 14;
const OVERLAP = 5;
const MAX = 4;

/**
 * A compact, right-aligned stack of tiny reader avatars (Messenger group style),
 * capped at MAX with a "+N" overflow chip. Rendered beneath the last message a
 * set of members has read.
 */
export function ReaderAvatars({
  readers,
  align = 'end',
}: {
  readers: ChatMember[];
  align?: 'start' | 'end';
}) {
  const c = useThemeColors();
  if (readers.length === 0) return null;
  const shown = readers.slice(0, MAX);
  const extra = readers.length - shown.length;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: align === 'end' ? 'flex-end' : 'flex-start',
        marginTop: 3,
      }}
    >
      {shown.map((m, i) => (
        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -OVERLAP }}>
          <Avatar uri={m.avatarUrl} name={m.name} size={SIZE} />
        </View>
      ))}
      {extra > 0 ? (
        <Text style={{ marginLeft: 3, fontSize: 10, fontWeight: '700', color: c.textFaint }}>
          +{extra}
        </Text>
      ) : null}
    </View>
  );
}
