import { useEffect, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, radii, spacing, useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// Near-critically damped (ratio ≈ 1): a quick slide that settles cleanly with
// no visible overshoot/bounce. overshootClamping guarantees it never passes the
// target even on a fast drag-release snap-back.
const SPRING = { damping: 30, stiffness: 220, overshootClamping: true };

/**
 * Custom bottom sheet (no gorhom dependency): spring slide-up, drag-to-dismiss
 * via the handle, tap-backdrop to close. Reanimated + gesture-handler only,
 * so it behaves the same on native and web.
 */
export function BottomSheet({ visible, onClose, children }: Props) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const translateY = useSharedValue(screenH);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.set(withSpring(0, SPRING));
      backdrop.set(withTiming(1, { duration: 200 }));
    }
  }, [visible, translateY, backdrop]);

  const close = () => {
    backdrop.set(withTiming(0, { duration: 180 }));
    translateY.set(
      withTiming(screenH, { duration: 220 }, (finished) => {
        if (finished) runOnJS(onClose)();
      })
    );
  };

  const drag = Gesture.Pan()
    .onChange((e) => {
      translateY.set(Math.max(0, translateY.get() + e.changeY));
    })
    .onEnd((e) => {
      if (translateY.get() > 120 || e.velocityY > 800) {
        backdrop.set(withTiming(0, { duration: 180 }));
        translateY.set(
          withTiming(screenH, { duration: 220 }, (finished) => {
            if (finished) runOnJS(onClose)();
          })
        );
      } else {
        translateY.set(withSpring(0, SPRING));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>
        {/* explicit styles: className is not processed on reanimated components */}
        <Animated.View
          style={[
            styles.sheet,
            // On web the Modal portals to the document root, outside the PhoneFrame
            // column — cap the sheet to the same phone width and center it so it
            // lines up with the app content instead of spanning the whole window.
            Platform.OS === 'web'
              ? { maxWidth: layout.webMaxWidth, marginHorizontal: 'auto' }
              : null,
            {
              paddingBottom: insets.bottom + 16,
              borderTopLeftRadius: radii['2xl'],
              borderTopRightRadius: radii['2xl'],
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: c.border,
              backgroundColor: c.surfaceRaised,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={drag}>
            <View className="items-center py-sm" collapsable={false}>
              <View className="h-[4px] w-[44px] rounded-full bg-border" />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
