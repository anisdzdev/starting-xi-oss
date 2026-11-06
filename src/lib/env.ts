import Constants from 'expo-constants';

type Extra = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  inviteCode: string;
  /** Optional — web push is disabled when missing. */
  vapidPublicKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

/**
 * Runtime env access. Values come from .env via app.config.ts `extra`.
 * Throws early with a clear message instead of failing deep inside supabase-js.
 */
export function getEnv(): Extra {
  const { supabaseUrl, supabaseAnonKey, inviteCode } = extra;
  if (!supabaseUrl || !supabaseAnonKey || !inviteCode) {
    throw new Error(
      'Missing SUPABASE_URL / SUPABASE_ANON_KEY / INVITE_CODE. Copy .env.example to .env, fill it in, and restart the dev server.'
    );
  }
  return { supabaseUrl, supabaseAnonKey, inviteCode };
}

/** True when both Supabase env vars are present (e.g. to no-op API calls in a fresh checkout). */
export const hasSupabaseConfig = Boolean(extra.supabaseUrl && extra.supabaseAnonKey);
