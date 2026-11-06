import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EyeOff } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState, Screen } from '@/components';
import { useSession } from '@/features/auth/session-context';
import { LiveRosterView } from '@/features/live/LiveRosterView';
import { useGameDay } from '@/features/live/useGameDay';
import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';

/**
 * Another league member's XI. Today's picks are hidden until the day's first
 * kickoff (UI gate; the league is friends-only). A PAST day (reached via the
 * Daily standings day-selector, passed as `gameDay`) is already played, so it's
 * always revealed — even while today's picks are still hidden.
 */
export default function TeamScreen() {
  const { userId, gameDay } = useLocalSearchParams<{ userId: string; gameDay?: string }>();
  const { session } = useSession();
  const { fixtures } = useGameDay();
  const [name, setName] = useState<string | null>(null);

  // A game day strictly before today is fully played → never gated.
  const isPastDay = !!gameDay && gameDay < currentGameDay();

  const lockTime = useMemo(() => {
    const times = (fixtures ?? []).map((f) => new Date(f.kickoff_utc).getTime());
    return times.length > 0 ? Math.min(...times) : null;
  }, [fixtures]);
  const locked = lockTime !== null && Date.now() >= lockTime;
  const isMe = userId === session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();
      if (!cancelled) setName(data?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hidden = !isMe && !locked && !isPastDay;

  const title = name
    ? isPastDay
      ? `${name}'s XI · ${format(parseISO(gameDay!), 'EEE d')}`
      : `${name}'s XI`
    : 'Team';

  return (
    <>
      <Stack.Screen options={{ title }} />
      {hidden ? (
        <Screen glow="hype" edges={['bottom']}>
          <EmptyState
            icon={EyeOff}
            title="Team hidden until kickoff"
            message={
              lockTime
                ? `Picks are revealed when the first match kicks off at ${new Date(
                    lockTime
                  ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
                : 'Picks are revealed when the first match kicks off.'
            }
          />
        </Screen>
      ) : userId ? (
        <LiveRosterView userId={userId} gameDay={gameDay} buildable={false} />
      ) : null}
    </>
  );
}
