import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from './supabase';

/**
 * Ask for notification permission and store the Expo push token on the
 * profile. Native only; quietly no-ops where push isn't available:
 *  - web (web_push_subscription will be a separate flow)
 *  - simulators/emulators (no push support)
 *  - Expo Go on SDK 53+ (remote push removed — needs a dev build)
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId: string | undefined =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {}))
      .data;

    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', user.id);
  } catch (e) {
    // Expected in Expo Go / without EAS project — push needs a dev build.
    console.warn('Push token registration skipped:', e instanceof Error ? e.message : e);
  }
}
