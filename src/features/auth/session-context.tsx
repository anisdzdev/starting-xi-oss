import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getSupabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  expo_push_token: string | null;
  onboarded_at: string | null;
  is_superuser: boolean;
};

type SessionState = {
  /** undefined while restoring from storage, null when signed out. */
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Keyed by user so a signed-out / switched user never sees a stale profile,
  // without needing synchronous cleanup setState in effects.
  const [profileState, setProfileState] = useState<{
    forUser: string;
    profile: Profile | null;
  } | null>(null);

  const lastFetchedUser = useRef<string | null>(null);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id, display_name, avatar_url, expo_push_token, onboarded_at, is_superuser')
      .eq('id', uid)
      .maybeSingle();
    lastFetchedUser.current = uid;
    setProfileState({ forUser: uid, profile: error ? null : ((data as Profile) ?? null) });
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    // Profile loads piggyback on auth events (not render effects) so each user's
    // profile is fetched exactly once per sign-in, token refreshes included.
    const onSession = (next: Session | null) => {
      setSession(next);
      const uid = next?.user.id;
      if (uid && lastFetchedUser.current !== uid) fetchProfile(uid);
      if (!uid) lastFetchedUser.current = null;
    };
    supabase.auth.getSession().then(({ data }) => {
      onSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => onSession(next));
    return () => sub.subscription.unsubscribe();
  }, [fetchProfile]);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (userId) await fetchProfile(userId);
  }, [userId, fetchProfile]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const profile = userId && profileState?.forUser === userId ? profileState.profile : null;

  const value = useMemo(
    () => ({
      session,
      profile,
      // loading until we know the session and (when signed in) have fetched the
      // profile once, so the route guards don't flash the wrong group
      loading: sessionLoading || (!!userId && profileState?.forUser !== userId),
      refreshProfile,
      signOut,
    }),
    [session, profile, sessionLoading, userId, profileState, refreshProfile, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
