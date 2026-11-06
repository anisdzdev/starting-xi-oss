import { Platform } from 'react-native';

import { getSupabase } from './supabase';

/**
 * VAPID public key (safe in the bundle); web push is disabled without it.
 * EXPO_PUBLIC_* vars are inlined at bundle time — the reliable mechanism for
 * client-visible config (expo-constants extra proved flaky on web dev).
 */
const VAPID_PUBLIC_KEY: string = process.env.EXPO_PUBLIC_VAPID_KEY ?? '';

export function webPushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

/** Register the offline/push service worker (web only; call once at startup). */
export async function registerServiceWorker(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('Service worker registration failed:', e);
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type WebPushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

/** Prompt for permission, subscribe, persist to profiles.web_push_subscription. */
export async function enableWebPush(): Promise<WebPushStatus> {
  if (!webPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed';

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('profiles')
      .update({ web_push_subscription: sub.toJSON() })
      .eq('id', user.id);
  }
  return 'subscribed';
}

/** Unsubscribe locally and clear the stored subscription. */
export async function disableWebPush(): Promise<WebPushStatus> {
  if (!webPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({ web_push_subscription: null }).eq('id', user.id);
  }
  return 'unsubscribed';
}
