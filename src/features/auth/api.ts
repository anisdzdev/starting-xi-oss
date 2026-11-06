import { getEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

/**
 * Friends-league gate: the invite code is an env-configured constant checked
 * before we ever hit Supabase. It ships in the client bundle — a speed bump
 * against randoms, not a security boundary (the league is capped at ~10 people
 * who all know each other).
 */
export function isValidInviteCode(code: string): boolean {
  return code.trim().toLowerCase() === getEnv().inviteCode.toLowerCase();
}

/** Sends a 6-digit code to the email (creates the account on first sign-in). */
export async function requestOtp(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

/** Exchanges the emailed code for a session. */
export async function verifyOtp(email: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
}

/** Uploads avatar bytes to the user's folder, returns the public URL. */
export async function uploadAvatar(base64: string, contentType: string): Promise<string> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const ext = contentType.split('/')[1] ?? 'jpg';
  const path = `${user.id}/avatar.${ext}`;
  const bytes = base64ToUint8Array(base64);

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // cache-bust: the path is stable, so stale CDN/browser caches would show the old image
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function completeOnboarding(displayName: string, avatarUrl: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName.trim(),
      avatar_url: avatarUrl,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (error) throw new Error(error.message);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
