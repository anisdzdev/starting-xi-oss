import { Send, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components';
import { useThemeColors } from '@/theme';

import { GifPicker } from './GifPicker';
import { applyMention, findMentionQuery, matchMembers } from './mentions';
import { klipyConfigured, type Gif } from './klipy';
import type { ChatMember, ChatMessage } from './types';

const GIF_BTN_W = 44;

/**
 * Message input with @-mention autocomplete. Detects the in-progress @-token at
 * the cursor, shows matching members in a floating list above the field, and
 * inserts "@Name " on tap. Selection is controlled so the cursor lands correctly
 * after an insert.
 */
export function ChatComposer({
  members,
  onSend,
  onSendGif,
  replyingTo,
  onCancelReply,
}: {
  members: ChatMember[];
  onSend: (body: string) => void;
  onSendGif: (gif: Gif) => void;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
}) {
  const c = useThemeColors();
  const [text, setText] = useState('');
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [gifOpen, setGifOpen] = useState(false);
  const gifsEnabled = klipyConfigured();

  // Messenger-style: the GIF button is present while the field is empty and
  // smoothly collapses away as soon as you start typing.
  const gifShown = gifsEnabled && text.length === 0;
  const gifAnim = useSharedValue(gifsEnabled ? 1 : 0);
  useEffect(() => {
    gifAnim.set(withTiming(gifShown ? 1 : 0, { duration: 190, easing: Easing.out(Easing.cubic) }));
  }, [gifShown, gifAnim]);
  const gifWrapStyle = useAnimatedStyle(() => ({
    width: gifAnim.value * GIF_BTN_W,
    marginRight: gifAnim.value * 8,
    opacity: gifAnim.value,
    transform: [{ translateX: (gifAnim.value - 1) * 10 }],
  }));

  const mention = findMentionQuery(text, sel.end);
  const matches = mention ? matchMembers(mention.query, members) : [];
  const showAutocomplete = !!mention && matches.length > 0;

  const pick = (m: ChatMember) => {
    const { text: next, cursor } = applyMention(text, sel.end, m);
    setText(next);
    setSel({ start: cursor, end: cursor });
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
    setSel({ start: 0, end: 0 });
  };

  const canSend = text.trim().length > 0;

  return (
    <View style={{ position: 'relative' }}>
      {replyingTo ? (
        <View
          className="flex-row items-center gap-sm px-md py-sm"
          style={{
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.surface,
          }}
        >
          <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: c.primary, borderRadius: 1 }} />
          <View style={{ flex: 1 }}>
            <Text className="text-xs font-bold" style={{ color: c.textMuted }} numberOfLines={1}>
              Replying to {replyingTo.author?.name ?? 'Player'}
            </Text>
            <Text className="text-xs" style={{ color: c.textFaint }} numberOfLines={1}>
              {replyingTo.gifUrl ? 'GIF' : replyingTo.body}
            </Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            hitSlop={10}
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: c.surfaceRaised }}
            accessibilityLabel="Cancel reply"
          >
            <X size={15} color={c.textMuted} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : null}

      {showAutocomplete ? (
        <View
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: '100%',
            marginBottom: 6,
            maxHeight: 220,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceRaised,
            overflow: 'hidden',
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {matches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => pick(m)}
                className="flex-row items-center gap-sm px-md py-sm"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? c.surfaceGlass : 'transparent',
                })}
              >
                <Avatar uri={m.avatarUrl} name={m.name} size={28} />
                <Text className="text-base font-semibold text-text">{m.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View
        className="flex-row px-md py-sm"
        style={{
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.surface,
          alignItems: 'center',
        }}
      >
        {gifsEnabled ? (
          <Animated.View
            pointerEvents={gifShown ? 'auto' : 'none'}
            style={[gifWrapStyle, { overflow: 'hidden' }]}
          >
            <Pressable
              onPress={() => setGifOpen(true)}
              className="h-9 items-center justify-center rounded-full"
              style={{ width: GIF_BTN_W, backgroundColor: c.surfaceRaised }}
              accessibilityLabel="Send a GIF"
            >
              <Text
                className="text-xs font-extrabold"
                style={{ color: c.textMuted, letterSpacing: 0.5 }}
              >
                GIF
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          selection={sel}
          onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
          placeholder="Message  ·  @ to mention"
          placeholderTextColor={c.textFaint}
          multiline
          maxLength={2000}
          textAlignVertical="center"
          className="flex-1 rounded-full px-md"
          style={{
            color: c.text,
            backgroundColor: c.surfaceRaised,
            // Center the single line: symmetric padding around the natural line
            // box (minHeight 36 ≈ ~20px line + 8+8 padding). NO explicit lineHeight
            // — a lineHeight below the fontSize shifts iOS TextInput text vertically
            // (misaligned on device, though web tolerates it).
            minHeight: 36,
            maxHeight: 110,
            paddingTop: 8,
            paddingBottom: 8,
            fontSize: 15,
            // suppress the browser's default focus outline on web
            ...(({ outlineStyle: 'none' } as unknown) as object),
          }}
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{
            marginLeft: 8,
            backgroundColor: canSend ? c.primary : c.surfaceRaised,
            opacity: canSend ? 1 : 0.6,
          }}
        >
          <Send size={18} color={canSend ? c.onPrimary : c.textFaint} strokeWidth={2.2} />
        </Pressable>
      </View>

      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(gif) => {
          setGifOpen(false);
          onSendGif(gif);
        }}
      />
    </View>
  );
}
