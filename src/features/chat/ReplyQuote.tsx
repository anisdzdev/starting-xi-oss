import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

import type { ChatReplyPreview } from './types';

/**
 * The quoted-original block shown ABOVE a reply bubble: author + one-line snippet
 * (or "GIF" + a tiny thumbnail). Tapping it jumps to the original message.
 * Aligned to match its bubble (right for own messages, left for others').
 */
export function ReplyQuote({
  reply,
  mine,
  onPress,
}: {
  reply: ChatReplyPreview;
  mine: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 8,
        paddingRight: 4,
        paddingVertical: 3,
        marginBottom: 2,
        borderLeftWidth: 2,
        borderLeftColor: c.primary,
        opacity: 0.85,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text
          style={{ fontSize: 11, fontWeight: '700', color: c.textMuted }}
          numberOfLines={1}
        >
          {reply.authorName}
        </Text>
        <Text style={{ fontSize: 12, color: c.textFaint }} numberOfLines={1}>
          {reply.isGif ? 'GIF' : reply.body}
        </Text>
      </View>
      {reply.isGif && reply.gifUrl ? (
        <Image
          source={reply.gifUrl}
          style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: c.surfaceRaised }}
          contentFit="cover"
          accessibilityLabel="GIF"
        />
      ) : null}
    </Pressable>
  );
}
