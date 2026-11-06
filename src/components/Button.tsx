import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { radii, spacing, useThemeColors } from '@/theme';

type Variant = 'primary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  icon?: LucideIcon;
};

// NOTE: NativeWind className is NOT processed on reanimated components — all
// visual styling on the animated pill is explicit theme styles (see ARCHITECTURE.md).
export function Button({ title, onPress, disabled, loading, variant = 'primary', icon: Icon }: Props) {
  const c = useThemeColors();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const background =
    variant === 'primary'
      ? pressed
        ? c.primaryPressed
        : c.primary
      : variant === 'danger'
        ? pressed
          ? c.dangerPressed
          : c.danger
        : 'transparent';
  const labelColor =
    variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.onDanger : c.primary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        scale.set(withSpring(0.96, { damping: 18, stiffness: 320 }));
      }}
      onPressOut={() => {
        setPressed(false);
        scale.set(withSpring(1, { damping: 14, stiffness: 280 }));
      }}
      disabled={disabled || loading}
    >
      <Animated.View
        style={[
          pressedStyle,
          {
            height: 48,
            borderRadius: radii.lg,
            paddingHorizontal: spacing.xl,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: background,
            opacity: disabled || loading ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {Icon ? <Icon size={18} color={labelColor} strokeWidth={2.2} /> : null}
            <Text style={{ color: labelColor, fontSize: 16, lineHeight: 24, fontWeight: '600' }}>
              {title}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}
