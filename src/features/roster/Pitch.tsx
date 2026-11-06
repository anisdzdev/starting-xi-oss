import { useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { radii } from '@/theme';

type Props = ViewProps & {
  /**
   * clean (default) = seamless FotMob-style grass, no stripes;
   * striped = a few wide mow bands.
   */
  variant?: 'clean' | 'striped' | 'transparent';
};

const LINE = { stroke: '#FFFFFF', strokeOpacity: 0.22, strokeWidth: 0.7, fill: 'none' as const };

/** Pitch proportions are locked to the SVG viewBox (100 × 140). */
const PITCH_RATIO = 100 / 140;

/**
 * Stylized vertical pitch, goal at the bottom (own half + center circle at top).
 * Edge-to-edge (no inner padding): grass gradient → optional mow bands → sheen
 * → minimal lines (center arc, penalty area, six-yard, penalty arc) → vignette.
 * Pure SVG: renders identically on native and web. Children (slots) overlay it.
 *
 * `style` (flex/margins) sizes the available frame; the pitch itself keeps the
 * viewBox aspect ratio, centered inside it — never stretched. `onLayout` and
 * other view props land on the fitted pitch, so pixel-coordinate consumers
 * (FlyingChip, CaptainBurst) measure the real pitch.
 */
export function Pitch({ children, style, variant = 'transparent', ...rest }: Props) {
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const fitted = frame
    ? frame.w / frame.h > PITCH_RATIO
      ? { width: frame.h * PITCH_RATIO, height: frame.h }
      : { width: frame.w, height: frame.w / PITCH_RATIO }
    : null;

  return (
    <View
      style={[styles.frame, style]}
      onLayout={(e) =>
        setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {fitted ? (
        <View style={[styles.pitch, fitted]} {...rest}>
          {/* Grass is clipped to the rounded rect; SLOTS are not — a bottom-line
              GK's points pill must be able to spill past the pitch edge. */}
          <View style={styles.clip}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 140"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFill}
          >
            <Defs>
              <LinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#15503B" />
                <Stop offset="0.55" stopColor="#0F4030" />
                <Stop offset="1" stopColor="#0B3124" />
              </LinearGradient>
              <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.05" />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.02" />
              </LinearGradient>
              <RadialGradient id="vignette" cx="0.5" cy="0.42" r="0.9">
                <Stop offset="0.6" stopColor="#000000" stopOpacity="0" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0.30" />
              </RadialGradient>
            </Defs>

            {/* grass base */}
            <Rect x="0" y="0" width="100" height="140" fill={variant === "transparent" ? "transparent" : "url(#grass)"} />

            {/* mow bands (striped variant only): 3 wide bands → 6 perceived stripes */}
            {variant === 'striped'
              ? [0, 47, 94].map((y) => (
                  <Rect key={y} x="0" y={y} width="100" height="23.5" fill="#FFFFFF" opacity={0.03} />
                ))
              : null}

            {/* sheen */}
            <Rect x="0" y="0" width="100" height="140" fill="url(#sheen)" />

            {/* lines — single pass, no glow, flush with the edges */}
            {/* center circle (clipped by the top edge) */}
            <Path d="M 33.5 0 A 16.5 16.5 0 0 0 66.5 0" {...LINE} />
            {/* penalty area (FotMob-style rounded top corners) */}
            <Path d="M 23 140 L 23 116.5 Q 23 114 25.5 114 L 74.5 114 Q 77 114 77 116.5 L 77 140" {...LINE} />
            {/* six-yard box */}
            <Path d="M 36 140 L 36 132 Q 36 130 38 130 L 62 130 Q 64 130 64 132 L 64 140" {...LINE} />
            {/* penalty arc */}
            <Path d="M 40.8 114 A 10 10 0 0 1 59.2 114" {...LINE} />

            {/* vignette on top */}
            <Rect x="0" y="0" width="100" height="140" fill="url(#vignette)" />
          </Svg>
          </View>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  // No overflow:hidden here — slots overlay the pitch and may extend past its
  // bottom edge (e.g. the GK's points pill). The grass is clipped separately.
  pitch: { borderRadius: radii.xl },
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
});
