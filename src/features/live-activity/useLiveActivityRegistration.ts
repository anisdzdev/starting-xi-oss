import { useEffect } from 'react';

import { currentGameDay } from '@/shared/gameday';

import { upsertActivityToken, upsertPushToStartToken } from './api';
import { LiveActivity } from './native';
import { cacheActivityImages } from './photoCache';

/**
 * Register Live Activity tokens with the backend and warm the image cache.
 * Called once from the (app) layout (like registerPushToken). No-ops on web,
 * Android, Expo Go, and iOS < 16.2.
 *
 * Flow:
 *  - push-to-start token (iOS 17.2+) → live_activity_push_tokens; the backend
 *    uses it to START an activity when a relevant match kicks off.
 *  - per-activity token (after an activity starts) → live_activities; the
 *    backend uses it to UPDATE/END that activity.
 */
export function useLiveActivityRegistration(): void {
  useEffect(() => {
    if (!LiveActivity.isSupported()) return;

    // pre-download today's player photos + flags into the App Group container
    void cacheActivityImages(currentGameDay());

    const subscriptions = [
      LiveActivity.onPushToStartToken((token) => {
        void upsertPushToStartToken(token);
      }),
      LiveActivity.onActivityPushToken((id, token) => {
        void upsertActivityToken(id, token, currentGameDay());
      }),
    ];

    return () => subscriptions.forEach((s) => s?.remove());
  }, []);
}
