import { Image } from 'expo-image';
import { Search, User } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { BottomSheet, EmptyState, FlagBadge, Skeleton } from '@/components';
import type { TeamLite } from '@/features/live/useGameDay';
import { getSupabase } from '@/lib/supabase';
import type { Position } from '@/shared/scoring';
import { useThemeColors } from '@/theme';

import type { PickedPlayer } from './store';

export type PickerPlayer = {
  id: number;
  name: string;
  position: Position;
  image_url: string | null;
  club: string | null;
  team: TeamLite;
};

type SortKey = 'name' | 'club';

type Props = {
  visible: boolean;
  position: Position | null;
  /** Teams playing on the current game day (from useGameDay — shared EST rule). */
  playingTeams: TeamLite[];
  /**
   * Season of the build day. A person has one `players` row PER season (same club
   * next season = a new row), so without this a returning player would show twice.
   * Null = seasons not loaded → unscoped (safe today: one season's rows per club).
   */
  seasonId: string | null;
  /** Player ids already in the XI or bench tray. */
  pickedIds: Set<number>;
  onClose: () => void;
  onPick: (player: PickedPlayer) => void;
  /** Long-press a row to open the full player card. */
  onInspect?: (playerId: number) => void;
};

/** Players of `position` whose team plays today, registered in `seasonId`. */
function usePickerPlayers(
  position: Position | null,
  teamIds: number[],
  seasonId: string | null
) {
  const [players, setPlayers] = useState<PickerPlayer[] | null>(null);
  const teamKey = teamIds.join(',');

  useEffect(() => {
    if (!position || teamIds.length === 0) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set only after await
    setPlayers(null); // show skeletons on position change
    (async () => {
      let q = getSupabase()
        .from('players')
        .select('id, name, position, image_url, club, team:teams(id, name, code, flag_url)')
        .eq('position', position)
        .in('team_id', teamIds);
      if (seasonId) q = q.eq('season_id', seasonId);
      const { data } = await q.order('name');
      if (!cancelled) setPlayers((data as unknown as PickerPlayer[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teamKey stands in for teamIds
  }, [position, teamKey, seasonId]);

  return players;
}

function PlayerPhoto({ uri, size = 40 }: { uri: string | null; size?: number }) {
  const c = useThemeColors();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View
        className="items-center justify-center bg-surfaceRaised"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      >
        <User size={size * 0.5} color={c.textFaint} strokeWidth={1.8} />
      </View>
    );
  }
  return (
    <Image
      source={uri}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceRaised }}
      contentFit="cover"
      transition={100}
      onError={() => setFailed(true)}
    />
  );
}

export function PlayerPicker({
  visible,
  position,
  playingTeams,
  seasonId,
  pickedIds,
  onClose,
  onPick,
  onInspect,
}: Props) {
  const c = useThemeColors();
  const { height: windowH } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const teamIds = useMemo(() => playingTeams.map((t) => t.id), [playingTeams]);
  const players = usePickerPlayers(visible ? position : null, teamIds, seasonId);

  // fresh filters each time the sheet opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setTeamFilter(null);
    }
  }, [visible]);

  const shown = useMemo(() => {
    let list = players ?? [];
    if (teamFilter !== null) list = list.filter((p) => p.team.id === teamFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sortKey === 'club') {
        const ca = a.club ?? '￿'; // clubless last
        const cb = b.club ?? '￿';
        if (ca !== cb) return ca.localeCompare(cb);
      }
      return a.name.localeCompare(b.name);
    });
  }, [players, teamFilter, query, sortKey]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ height: Math.min(580, windowH * 0.72) }} className="gap-md pb-sm">
        <Text className="text-lg font-semibold text-text">
          Pick a {position ?? 'player'} · playing today
        </Text>

        {/* search */}
        <View className="h-11 flex-row items-center gap-sm rounded-lg border border-border bg-surface px-md">
          <Search size={16} color={c.textFaint} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name"
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            className="flex-1 text-base text-text"
          />
        </View>

        {/* team chips + sort */}
        <View className="flex-row items-center justify-between gap-md">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={playingTeams}
            keyExtractor={(t) => String(t.id)}
            contentContainerClassName="gap-sm"
            renderItem={({ item: t }) => {
              const active = teamFilter === t.id;
              return (
                <Pressable
                  onPress={() => setTeamFilter(active ? null : t.id)}
                  className={`flex-row items-center gap-xs rounded-full border px-sm py-xs ${
                    active ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                  }`}
                >
                  <FlagBadge uri={t.flag_url} code={t.code} size={20} />
                  <Text
                    className={`text-xs font-semibold ${active ? 'text-primary' : 'text-textMuted'}`}
                  >
                    {t.code}
                  </Text>
                </Pressable>
              );
            }}
          />
          <View className="flex-row gap-xs">
            {(['name', 'club'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setSortKey(k)}
                className={`rounded-full border px-sm py-xs ${
                  sortKey === k ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    sortKey === k ? 'text-primary' : 'text-textMuted'
                  }`}
                >
                  {k === 'name' ? 'Name' : 'Club'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* list */}
        {players === null ? (
          <View className="gap-md pt-sm">
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} className="flex-row items-center gap-md">
                <Skeleton circle height={40} />
                <View className="flex-1 gap-sm">
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No players found"
            message="Try a different name or clear the team filter."
          />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(p) => String(p.id)}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: p }) => {
              const picked = pickedIds.has(p.id);
              return (
                <Pressable
                  disabled={picked}
                  onLongPress={onInspect ? () => onInspect(p.id) : undefined}
                  delayLongPress={350}
                  onPress={() =>
                    onPick({
                      id: p.id,
                      name: p.name,
                      position: p.position,
                      imageUrl: p.image_url,
                      teamCode: p.team.code,
                      flagUrl: p.team.flag_url,
                    })
                  }
                  className={`flex-row items-center gap-md border-b border-border/50 py-sm ${
                    picked ? 'opacity-40' : 'active:bg-surface'
                  }`}
                >
                  <PlayerPhoto uri={p.image_url} />
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-text" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-xs text-textMuted" numberOfLines={1}>
                      {p.club ?? 'Unattached'}
                    </Text>
                  </View>
                  <FlagBadge uri={p.team.flag_url} code={p.team.code} size={24} />
                  {picked ? (
                    <Text className="text-xs font-semibold uppercase text-textFaint">Picked</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </BottomSheet>
  );
}
