import type { ReactElement } from 'react';
import { Platform, RefreshControl, type RefreshControlProps } from 'react-native';

import { useThemeColors } from '@/theme';

/**
 * Brand-colored pull-to-refresh element, native only.
 *
 * MUST be a raw <RefreshControl> element (not a wrapper component):
 * react-native-web clones refreshControl and re-parents the scroll content
 * into it — a wrapper component swallows every child. On web this returns
 * undefined (pull-to-refresh is a touch gesture; web users reload).
 */
export function useThemedRefreshControl(
  refreshing: boolean,
  onRefresh: () => void
): ReactElement<RefreshControlProps> | undefined {
  const c = useThemeColors();
  if (Platform.OS === 'web') return undefined;
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={c.primary}
      colors={[c.primary, c.accentCyan]}
      progressBackgroundColor={c.surfaceRaised}
    />
  );
}
