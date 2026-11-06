import { Image } from 'expo-image';
import { ExternalLink } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet, Button, EmptyState, FlagBadge, Skeleton } from '@/components';
import { spacing, useThemeColors } from '@/theme';

import { LineupPitch } from './LineupPitch';
import { useMatchDetails } from './matchDetails';
import type { Fixture } from './useGameDay';

export function MatchSheet({
  fixture,
  gameDay,
  visible,
  onClose,
}: {
  fixture: Fixture;
  gameDay: string;
  visible: boolean;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { height } = useWindowDimensions();
  const { data, loading, error, reload } = useMatchDetails(fixture.fotmob_id, gameDay, visible);

  // Default to the side with more of my players (tie → home). Once the user
  // taps the toggle, their choice wins (userTouched).
  const defaultSide: 'home' | 'away' = useMemo(() => {
    const h = data?.home.players.filter((p) => p.isMine).length ?? 0;
    const a = data?.away.players.filter((p) => p.isMine).length ?? 0;
    return a > h ? 'away' : 'home';
  }, [data]);
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [userTouched, setUserTouched] = useState(false);
  const activeSide = userTouched ? side : defaultSide;

  const team = activeSide === 'home' ? data?.home : data?.away;

  const lineupLabel =
    data?.lineupType === 'confirmed'
      ? 'Confirmed lineup'
      : data?.lineupType === 'predicted'
        ? 'Predicted XI'
        : null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.78 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          <View className="flex-row items-center justify-center gap-md">
            <View className="flex-row items-center gap-xs">
              <FlagBadge uri={fixture.home.flag_url} code={fixture.home.code} size={24} />
              <Text className="text-base font-bold text-text">{fixture.home.code}</Text>
            </View>
            <Text className="text-base font-bold text-textMuted">
              {fixture.status === 'live' || fixture.status === 'finished'
                ? `${fixture.home_score ?? 0} – ${fixture.away_score ?? 0}`
                : 'vs'}
            </Text>
            <View className="flex-row items-center gap-xs">
              <Text className="text-base font-bold text-text">{fixture.away.code}</Text>
              <FlagBadge uri={fixture.away.flag_url} code={fixture.away.code} size={24} />
            </View>
          </View>
          {lineupLabel ? (
            <Text className="text-center text-xs font-semibold uppercase tracking-widest text-textFaint">
              {lineupLabel}
              {team?.formation ? ` · ${team.formation}` : ''}
            </Text>
          ) : null}
        </View>

        {loading ? (
          <Skeleton width="100%" height={320} radius={20} />
        ) : error ? (
          <View className="gap-md py-lg">
            <Text className="text-center text-sm text-textMuted">{error}</Text>
            <Button title="Try again" variant="ghost" onPress={reload} />
          </View>
        ) : (
          <View className="gap-lg">
            {/* Team toggle */}
            <View className="flex-row gap-sm">
              {(['home', 'away'] as const).map((s) => {
                const meta = s === 'home' ? fixture.home : fixture.away;
                const active = activeSide === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setUserTouched(true);
                      setSide(s);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: spacing.sm,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: active ? c.primary : c.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? c.bg : c.textMuted,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {meta.code}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Pitch */}
            {team && team.players.length > 0 ? (
              <LineupPitch players={team.players} />
            ) : (
              <EmptyState
                title="Lineup not announced yet"
                message="Check back closer to kickoff."
              />
            )}

            {/* News */}
            {data && data.news.length > 0 ? (
              <View className="gap-sm">
                <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
                  News
                </Text>
                {data.news.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => Linking.openURL(n.url)}
                    className="flex-row items-center gap-md rounded-xl border border-border bg-surface p-sm active:opacity-80"
                  >
                    {n.image ? (
                      <Image
                        source={n.image}
                        style={{ width: 56, height: 56, borderRadius: 8 }}
                        contentFit="cover"
                      />
                    ) : null}
                    <View className="flex-1 gap-xs">
                      <Text numberOfLines={2} className="text-sm font-semibold text-text">
                        {n.title}
                      </Text>
                      <Text className="text-xs text-textFaint">{n.source}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Open in FotMob */}
            {data ? (
              <Pressable
                onPress={() => Linking.openURL(data.fotmobUrl)}
                className="flex-row items-center justify-center gap-sm rounded-xl border border-border bg-surface py-md active:opacity-80"
              >
                <ExternalLink size={16} color={c.textMuted} strokeWidth={2.2} />
                <Text className="text-sm font-semibold text-textMuted">Open in FotMob</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
