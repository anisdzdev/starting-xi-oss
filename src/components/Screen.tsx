import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gradients, useThemeColors } from '@/theme';

type Props = {
  children: ReactNode;
  /** Accent glow behind the content. 'hype' = WC26 purple/blue (default), 'pitch' = green/cyan, 'live' = red/pink. */
  glow?: 'hype' | 'pitch' | 'live' | 'none';
  /** Skip top/bottom safe-area padding (e.g. when a header/tab bar handles it). */
  edges?: ('top' | 'bottom')[];
  /** Scroll offset for a parallax glow drift (pass the screen's scrollY shared value). */
  parallax?: SharedValue<number>;
  style?: ViewStyle;
};

/**
 * Base screen wrapper: dark pitch-night background, safe-area padding, and a
 * slow-breathing gradient glow that gives screens the World Cup "alive" feel.
 * Pure transforms + opacity, so it renders identically on native and web.
 */
export function Screen({ children, glow = 'hype', edges = ['top', 'bottom'], parallax, style }: Props) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.set(
      withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [drift]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + drift.value * 0.18,
    transform: [
      { translateX: drift.value * 60 - 30 },
      // parallax: the glow trails the scroll at quarter speed
      { translateY: drift.value * 40 - 20 - (parallax ? parallax.value * 0.25 : 0) },
      { scale: 1 + drift.value * 0.15 },
    ],
  }));

  // First gradient color anchors the bright core, the last tints the falloff;
  // both fade to fully transparent at the edge so the glow feathers into the
  // background instead of reading as a hard-edged disc.
  const glowColors = gradients[glow as Exclude<Props['glow'], 'none' | undefined>];
  const coreColor = glowColors[0];
  const edgeColor = glowColors[glowColors.length - 1];

  return (
    <View style={[styles.root, { backgroundColor: c.bg }, style]}>
      {glow !== 'none' ? (
        <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={coreColor} stopOpacity={0.4} />
                <Stop offset="35%" stopColor={edgeColor} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={edgeColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#screenGlow)" />
          </Svg>
        </Animated.View>
      ) : null}
      <View
        style={[
          styles.content,
          {
            paddingTop: edges.includes('top') ? insets.top : 0,
            paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -200,
    right: -180,
    width: 520,
    height: 520,
  },
  content: { flex: 1 },
});
