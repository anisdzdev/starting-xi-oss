import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * Mirror of the Swift `StartingXIAttributes.ContentState` and the JSON from
 * `supabase/functions/_shared/buildActivityState.ts`. Only needed for the
 * local-start path (passed to `startActivity` as JSON).
 */
export interface LiveActivityContentState {
  layout: 'focused' | 'multi';
  totalPoints: number;
  updatedAt: number;
  matches: {
    homeCode: string;
    awayCode: string;
    homeScore: number | null;
    awayScore: number | null;
    minute: string | null;
    contributedPoints: number;
    playerCount: number;
    hasCaptain: boolean;
  }[];
  players: {
    id: number;
    initials: string;
    position: 'GK' | 'DEF' | 'MID' | 'FWD';
    teamCode: string;
    points: number;
    isCaptain: boolean;
  }[];
  lastEvent?: string;
}

interface NativeLiveActivity {
  isSupported(): boolean;
  areActivitiesEnabled(): boolean;
  appGroupContainerPath(): string | null;
  startActivity(stateJson: string, userId: string, gameDay: string): Promise<{ id: string }>;
  endActivity(id: string | null): Promise<void>;
  addListener(
    event: 'onPushToStartToken',
    listener: (e: { token: string }) => void
  ): EventSubscription;
  addListener(
    event: 'onActivityPushToken',
    listener: (e: { id: string; token: string }) => void
  ): EventSubscription;
}

// Native module is iOS-only; null on web/Android and in Expo Go (no custom
// native code). All accessors below degrade to no-ops when it's absent.
const Native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeLiveActivity>('LiveActivity')
    : null;

export const LiveActivity = {
  /** iOS 16.2+ with ActivityKit present. */
  isSupported: (): boolean => Native?.isSupported() ?? false,
  /** User has Live Activities enabled in Settings. */
  areEnabled: (): boolean => Native?.areActivitiesEnabled() ?? false,
  /** Shared App Group container path (for the photo/flag cache), or null. */
  appGroupPath: (): string | null => Native?.appGroupContainerPath() ?? null,

  /** Local start (iOS 16.2–17.1 fallback). Resolves null when unsupported. */
  startActivity: (
    state: LiveActivityContentState,
    userId: string,
    gameDay: string
  ): Promise<{ id: string } | null> =>
    Native ? Native.startActivity(JSON.stringify(state), userId, gameDay) : Promise.resolve(null),

  endActivity: (id: string | null = null): Promise<void> =>
    Native?.endActivity(id) ?? Promise.resolve(),

  /** Push-to-start token (iOS 17.2+): backend uses it to START an activity. */
  onPushToStartToken: (cb: (token: string) => void): EventSubscription | null =>
    Native?.addListener('onPushToStartToken', (e) => cb(e.token)) ?? null,

  /** Per-activity update token, reported once an activity is running. */
  onActivityPushToken: (cb: (id: string, token: string) => void): EventSubscription | null =>
    Native?.addListener('onActivityPushToken', (e) => cb(e.id, e.token)) ?? null,
};
