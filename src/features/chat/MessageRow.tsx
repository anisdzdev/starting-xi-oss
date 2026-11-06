import { Image } from 'expo-image';
import { CornerUpLeft } from 'lucide-react-native';
import { memo, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components';
import { useThemeColors } from '@/theme';

import { MentionText } from './MentionText';
import { ReaderAvatars } from './ReaderAvatars';
import { ReplyQuote } from './ReplyQuote';
import type { ChatMember, ChatMessage } from './types';

const AVATAR = 28;
const GIF_MAX_W = 200;
const REPLY_THRESHOLD = 55;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function gifSize(message: ChatMessage): { width: number; height: number } {
  const w = message.gifWidth || GIF_MAX_W;
  const h = message.gifHeight || GIF_MAX_W;
  const width = Math.min(GIF_MAX_W, w);
  return { width, height: Math.round((width * h) / (w || 1)) };
}

type Props = {
  message: ChatMessage;
  members: ChatMember[];
  meId: string | null;
  groupStart: boolean;
  groupEnd: boolean;
  showTimeSeparator: boolean;
  separatorLabel: string;
  readers: ChatMember[];
  showTime: boolean;
  onToggleTime: (id: number) => void;
  onReply: (message: ChatMessage) => void;
  onJumpTo: (id: number) => void;
  highlighted: boolean;
};

/**
 * A Messenger-style message. Author name sits above the bubble (group start only);
 * own messages are a solid purple bubble on the right, others a grey bubble beside
 * the avatar. Swipe right to reply (a reanimated pan past REPLY_THRESHOLD fires
 * onReply). A reply renders a tappable quote of its original above the bubble.
 * Tapping the bubble reveals its send time (animated; single-at-a-time is enforced
 * by the parent via showTime/onToggleTime). Reader avatars sit beneath the bubble.
 */
export const MessageRow = memo(function MessageRow({
  message,
  members,
  meId,
  groupStart,
  groupEnd,
  showTimeSeparator,
  separatorLabel,
  readers,
  showTime,
  onToggleTime,
  onReply,
  onJumpTo,
  highlighted,
}: Props) {
  const c = useThemeColors();
  const mine = message.userId === meId;
  const mentionsMe = !!meId && message.mentions.includes(meId);
  const name = message.author?.name ?? 'Player';
  const isGif = !!message.gifUrl;

  // ---- slide-to-reply (rightward drag) ----
  // A real slide (pan activates past activeOffsetX) sets a suppress flag so the
  // bubble's onPress / quote jump don't ALSO fire on release (they'd reveal the
  // time or scroll). Cleared shortly after the gesture ends, and defensively in
  // the tap handlers themselves.
  const suppressTapRef = useRef(false);
  const setSuppress = (v: boolean) => {
    suppressTapRef.current = v;
  };
  const clearSuppressSoon = () => {
    setTimeout(() => {
      suppressTapRef.current = false;
    }, 60);
  };

  const tx = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onStart(() => {
      runOnJS(setSuppress)(true);
    })
    .onUpdate((e) => {
      tx.value = Math.max(0, Math.min(e.translationX, 80));
    })
    .onEnd(() => {
      if (tx.value > REPLY_THRESHOLD) runOnJS(onReply)(message);
      tx.value = withSpring(0, { damping: 18, stiffness: 200 });
      runOnJS(clearSuppressSoon)();
    });

  const handleToggleTime = () => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    onToggleTime(message.id);
  };
  const handleJump = () => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    if (message.replyTo) onJumpTo(message.replyTo.id);
  };
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: Math.min(tx.value / REPLY_THRESHOLD, 1),
  }));

  // ---- animated time caption (opacity + height, no mount/unmount) ----
  const timeAnim = useSharedValue(showTime ? 1 : 0);
  useEffect(() => {
    timeAnim.set(withTiming(showTime ? 1 : 0, { duration: 160 }));
  }, [showTime, timeAnim]);
  const timeStyle = useAnimatedStyle(() => ({
    height: timeAnim.value * 16,
    opacity: timeAnim.value,
  }));

  // ---- jump-to highlight pulse ----
  const hl = useSharedValue(0);
  useEffect(() => {
    if (highlighted) {
      hl.set(1);
      hl.set(withTiming(0, { duration: 700 }));
    }
  }, [highlighted, hl]);
  const hlStyle = useAnimatedStyle(() => ({ opacity: hl.value * 0.18 }));

  const gif = isGif ? gifSize(message) : null;
  const gifNode = gif ? (
    <Image
      source={message.gifUrl}
      // pointerEvents none so the image never captures the touch — taps and
      // swipe-to-reply both route to the parent Pressable / pan, exactly like a
      // text bubble (whose MentionText never captures). Without this the image
      // can swallow the swipe, making GIF messages feel un-replyable.
      pointerEvents="none"
      style={{
        width: gif.width,
        height: gif.height,
        borderRadius: 14,
        backgroundColor: c.surfaceRaised,
      }}
      contentFit="cover"
      transition={150}
      accessibilityLabel="GIF"
    />
  ) : null;

  const bubbleInner = isGif ? (
    gifNode
  ) : (
    <MentionText
      body={message.body}
      members={members}
      meId={meId}
      baseColor={mine ? '#FFFFFF' : undefined}
      mentionColor={mine ? '#FFFFFF' : undefined}
    />
  );

  const bubble = (
    <Pressable
      onPress={handleToggleTime}
      className={
        isGif
          ? mine
            ? 'max-w-[80%]'
            : 'self-start'
          : mine
            ? 'max-w-[80%] rounded-3xl px-md py-sm'
            : 'self-start rounded-3xl px-md py-sm'
      }
      style={
        isGif
          ? undefined
          : mine
            ? { backgroundColor: c.accentPurple }
            : {
                backgroundColor: c.surfaceRaised,
                borderWidth: mentionsMe ? 1 : 0,
                borderColor: mentionsMe ? c.captain : 'transparent',
              }
      }
    >
      {bubbleInner}
    </Pressable>
  );

  const separator = showTimeSeparator ? (
    <Text className="my-md text-center text-xs font-semibold text-textFaint">
      {separatorLabel}
    </Text>
  ) : null;

  // The message column (quote + bubble) is what slides; the reply hint sits behind
  // it, the highlight overlay fills the whole row, time + readers stay static below.
  // width:100% (a DEFINITE width) is important — the bubble's `max-w-[80%]` cap
  // resolves against it; a shrink-wrapped column would collapse the bubble to its
  // minimum width (wrapping short text to multiple lines, mis-aligning GIFs).
  const column = (
    <View style={{ width: '100%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {message.replyTo ? (
        <ReplyQuote reply={message.replyTo} mine={mine} onPress={handleJump} />
      ) : null}
      {bubble}
    </View>
  );

  const timeCaption = (
    <Animated.View
      style={[{ overflow: 'hidden', alignSelf: mine ? 'flex-end' : 'flex-start' }, timeStyle]}
    >
      <Text className="text-xs text-textFaint" style={{ marginTop: 1, marginHorizontal: 4 }}>
        {timeLabel(message.createdAt)}
      </Text>
    </Animated.View>
  );

  if (mine) {
    return (
      <View>
        {separator}
        <View style={{ marginTop: groupStart ? 10 : 2 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.primary, borderRadius: 12 },
              hlStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', right: 12, top: 8 }, hintStyle]}
          >
            <CornerUpLeft size={18} color={c.textMuted} strokeWidth={2.2} />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ width: '100%', paddingHorizontal: 12, alignItems: 'flex-end' }, slideStyle]}>
              {column}
            </Animated.View>
          </GestureDetector>
          <View style={{ paddingHorizontal: 12, alignItems: 'flex-end' }}>
            {timeCaption}
            <ReaderAvatars readers={readers} align="end" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      {separator}
      <View style={{ marginTop: groupStart ? 10 : 2 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.primary, borderRadius: 12 },
            hlStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 12, top: 8 }, hintStyle]}
        >
          <CornerUpLeft size={18} color={c.textMuted} strokeWidth={2.2} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12 }, slideStyle]}
          >
            {groupEnd ? (
              <Avatar uri={message.author?.avatarUrl} name={name} size={AVATAR} />
            ) : (
              <View style={{ width: AVATAR }} />
            )}
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              {groupStart ? (
                <Text className="mb-[3px] ml-sm text-xs font-medium text-textMuted">{name}</Text>
              ) : null}
              {column}
            </View>
          </Animated.View>
        </GestureDetector>
        <View style={{ paddingHorizontal: 12, marginLeft: AVATAR + 8, alignItems: 'flex-start' }}>
          {timeCaption}
          <ReaderAvatars readers={readers} align="end" />
        </View>
      </View>
    </View>
  );
});
