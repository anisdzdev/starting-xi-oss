import * as Application from 'expo-application';

import { getSupabase } from '@/lib/supabase';

// APNs environment: dev/EAS-dev builds register with sandbox APNs; TestFlight +
// App Store use production. __DEV__ is false in both TestFlight and App Store.
const apnsEnv = (): 'prod' | 'sandbox' => (__DEV__ ? 'sandbox' : 'prod');

/** Store this device's push-to-start token so the backend can START activities. */
export async function upsertPushToStartToken(token: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const deviceId = (await Application.getIosIdForVendorAsync()) ?? 'unknown-device';
  await supabase.from('live_activity_push_tokens').upsert(
    {
      user_id: user.id,
      device_id: deviceId,
      push_to_start_token: token,
      env: apnsEnv(),
    },
    { onConflict: 'user_id,device_id' }
  );
}

/**
 * Record a running activity's update token. Also clears the server-inserted
 * start placeholder (`start:<user>:<gameDay>`) now that the real activity exists.
 */
export async function upsertActivityToken(
  activityId: string,
  token: string,
  gameDay: string
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('live_activities').upsert(
    {
      id: activityId,
      user_id: user.id,
      push_token: token,
      game_day: gameDay,
      env: apnsEnv(),
      state: 'active',
    },
    { onConflict: 'id' }
  );

  // drop the placeholder the backend inserted to dedupe the start push
  await supabase.from('live_activities').delete().eq('id', `start:${user.id}:${gameDay}`);
}
