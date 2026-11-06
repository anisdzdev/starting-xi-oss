import { Image } from 'expo-image';
import {
  AlertTriangle,
  BadgeCheck,
  Crown,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  User,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet, Button, Card, FlagBadge, Skeleton } from '@/components';
import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';
import type { Position } from '@/shared/scoring';
import { useThemeColors } from '@/theme';

type PlayerDetails = {
  id: number;
  name: string;
  position: Position;
  image_url: string | null;
  club: string | null;
  team: { id: number; name: string; code: string; flag_url: string | null };
};

type TodayFixture = {
  kickoff_utc: string;
  home: { id: number; name: string; code: string };
  away: { id: number; name: string; code: string };
};

export type ScoutCard = {
  form_summary: string;
  strengths: [string, string];
  risk: string;
  pick_verdict: string;
  confidence: number;
};

type Props = {
  playerId: number | null;
  onClose: () => void;
  /** Slot context (when opened from the pitch): enables captain/remove actions. */
  slotActions?: {
    isCaptain: boolean;
    onToggleCaptain: () => void;
    onRemove: () => void;
  } | null;
};

function ConfidenceStars({ value }: { value: number }) {
  const c = useThemeColors();
  return (
    <View className="flex-row gap-xs">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={16}
          color={i <= value ? c.captain : c.textFaint}
          fill={i <= value ? c.captain : 'transparent'}
          strokeWidth={1.8}
        />
      ))}
    </View>
  );
}

function ScoutReport({ playerId }: { playerId: number }) {
  const c = useThemeColors();
  const [card, setCard] = useState<ScoutCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (regenerate: boolean) => {
      setLoading(true);
      setError(null);
      if (regenerate) setCard(null);
      const { data, error: fnErr } = await getSupabase().functions.invoke('scout-card', {
        body: { player_id: playerId, game_day: currentGameDay(), regenerate },
      });
      if (fnErr || !data?.ok) {
        let message = fnErr?.message ?? data?.error ?? 'Could not load the scout report.';
        // supabase-js wraps non-2xx in a generic error; surface the function's message
        if (fnErr && 'context' in fnErr) {
          try {
            const body = await (fnErr as { context: Response }).context.json();
            if (body?.error) message = body.error;
          } catch {
            // keep generic message
          }
        }
        setError(message);
      } else {
        setCard(data.card as ScoutCard);
      }
      setLoading(false);
    },
    [playerId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    load(false);
  }, [load]);

  return (
    <View className="gap-md">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
          Scout report
        </Text>
        <Pressable
          onPress={() => load(true)}
          disabled={loading}
          className={`flex-row items-center gap-xs rounded-full border border-border px-sm py-xs ${
            loading ? 'opacity-40' : 'active:bg-surface'
          }`}
        >
          <RefreshCw size={12} color={c.textMuted} strokeWidth={2.2} />
          <Text className="text-xs font-semibold text-textMuted">Regenerate</Text>
        </Pressable>
      </View>

      {loading ? (
        <Card variant="glass" className="gap-md">
          <Skeleton width="90%" height={14} />
          <Skeleton width="70%" height={14} />
          <Skeleton width="55%" height={12} />
          <Skeleton width="80%" height={12} />
          <Skeleton width={110} height={16} />
        </Card>
      ) : error ? (
        <Card variant="glass" className="gap-md">
          <View className="flex-row items-center gap-sm">
            <AlertTriangle size={16} color={c.warning} strokeWidth={2} />
            <Text className="flex-1 text-sm text-textMuted">{error}</Text>
          </View>
          <Button title="Try again" variant="ghost" onPress={() => load(false)} />
        </Card>
      ) : card ? (
        <Card variant="glass" className="gap-md">
          <View className="flex-row items-start gap-sm">
            <TrendingUp size={16} color={c.accentCyan} strokeWidth={2.2} />
            <Text className="flex-1 text-sm text-text">{card.form_summary}</Text>
          </View>
          {card.strengths.map((s) => (
            <View key={s} className="flex-row items-start gap-sm">
              <Sparkles size={16} color={c.primary} strokeWidth={2.2} />
              <Text className="flex-1 text-sm text-textMuted">{s}</Text>
            </View>
          ))}
          <View className="flex-row items-start gap-sm">
            <AlertTriangle size={16} color={c.warning} strokeWidth={2.2} />
            <Text className="flex-1 text-sm text-textMuted">{card.risk}</Text>
          </View>
          <View className="flex-row items-center justify-between rounded-lg bg-surface px-md py-sm">
            <View className="flex-1 flex-row items-center gap-sm">
              <BadgeCheck size={16} color={c.captain} strokeWidth={2.2} />
              <Text className="flex-1 text-sm font-semibold text-text">{card.pick_verdict}</Text>
            </View>
            <ConfidenceStars value={card.confidence} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

export function PlayerCardSheet({ playerId, onClose, slotActions = null }: Props) {
  const c = useThemeColors();
  const { height: windowH } = useWindowDimensions();
  const [details, setDetails] = useState<PlayerDetails | null>(null);
  const [fixture, setFixture] = useState<TodayFixture | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    setDetails(null);
    setFixture(null);
    setPhotoFailed(false);
    (async () => {
      const supabase = getSupabase();
      const { data: player } = await supabase
        .from('players')
        .select('id, name, position, image_url, club, team:teams!players_team_id_fkey(id, name, code, flag_url)')
        .eq('id', playerId)
        .single();
      if (cancelled || !player) return;
      const det = player as unknown as PlayerDetails;
      setDetails(det);

      const { data: fx } = await supabase
        .from('fixtures')
        .select(
          'kickoff_utc, home:teams!fixtures_home_team_fkey(id, name, code), away:teams!fixtures_away_team_fkey(id, name, code)'
        )
        .eq('game_day', currentGameDay())
        .or(`home_team.eq.${det.team.id},away_team.eq.${det.team.id}`)
        .maybeSingle();
      if (!cancelled) setFixture((fx as unknown as TodayFixture) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const opponent =
    fixture && details
      ? fixture.home.id === details.team.id
        ? fixture.away
        : fixture.home
      : null;

  return (
    <BottomSheet visible={playerId !== null} onClose={onClose}>
      <ScrollView
        style={{ maxHeight: windowH * 0.78 }}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-lg pb-lg"
      >
        {details === null ? (
          <View className="flex-row items-center gap-md py-md">
            <Skeleton circle height={84} />
            <View className="flex-1 gap-sm">
              <Skeleton width="60%" height={18} />
              <Skeleton width="40%" height={13} />
              <Skeleton width="50%" height={13} />
            </View>
          </View>
        ) : (
          <>
            {/* header: photo + identity */}
            <View className="flex-row items-center gap-lg">
              {details.image_url && !photoFailed ? (
                <Image
                  source={details.image_url}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    backgroundColor: c.surfaceRaised,
                  }}
                  contentFit="cover"
                  transition={150}
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <View
                  className="items-center justify-center bg-surfaceRaised"
                  style={{ width: 84, height: 84, borderRadius: 42 }}
                >
                  <User size={40} color={c.textFaint} strokeWidth={1.6} />
                </View>
              )}
              <View className="flex-1 gap-xs">
                <Text className="text-xl font-bold text-text">{details.name}</Text>
                <View className="flex-row items-center gap-sm">
                  <View className="rounded-sm bg-primary/15 px-xs py-[1px]">
                    <Text className="text-xs font-bold text-primary">{details.position}</Text>
                  </View>
                  <FlagBadge uri={details.team.flag_url} code={details.team.code} size={20} />
                  <Text className="text-sm text-textMuted">{details.team.name}</Text>
                </View>
                <Text className="text-sm text-textFaint">{details.club ?? 'Unattached'}</Text>
              </View>
            </View>

            {/* today's match */}
            <Card variant="elevated" className="flex-row items-center justify-between py-md">
              {opponent && fixture ? (
                <>
                  <Text className="text-sm text-textMuted">
                    Today vs <Text className="font-semibold text-text">{opponent.name}</Text>
                  </Text>
                  <Text className="text-sm font-semibold text-text">
                    {new Date(fixture.kickoff_utc).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </>
              ) : (
                <Text className="text-sm text-textMuted">No match today</Text>
              )}
            </Card>

            <ScoutReport playerId={details.id} />

            {slotActions ? (
              <View className="gap-md">
                <Button
                  title={slotActions.isCaptain ? 'Remove armband' : 'Give the armband'}
                  icon={Crown}
                  onPress={slotActions.onToggleCaptain}
                />
                <Button title="Remove from XI" variant="danger" onPress={slotActions.onRemove} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
