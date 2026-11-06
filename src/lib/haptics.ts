import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Subtle web fallback: short vibration where supported (mobile browsers), else nothing. */
function webBuzz(ms: number) {
  try {
    (navigator as { vibrate?: (ms: number) => void }).vibrate?.(ms);
  } catch {
    // vibration unsupported — visual feedback (flash) carries it
  }
}

/** Points ticked up for one of your players. */
export function scoreHaptic() {
  if (Platform.OS === 'web') return webBuzz(20);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Your CAPTAIN scored — bigger moment. */
export function captainHaptic() {
  if (Platform.OS === 'web') return webBuzz(60);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

/** Light tick for selections (tabs, picks). */
export function selectHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => undefined);
}
