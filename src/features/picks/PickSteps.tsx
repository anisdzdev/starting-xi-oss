import { Search, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Avatar, EmptyState, FlagBadge, Skeleton } from '@/components';
import { getSupabase } from '@/lib/supabase';
import { useThemeColors } from '@/theme';

export type TeamOption = { id: number; name: string; code: string; flag_url: string | null };
export type PlayerOption = {
  id: number;
  name: string;
  image_url: string | null;
  position: string;
  team: { code: string; flag_url: string | null };
};

/** Step 1 — Team of the Tournament: all 48 teams as a flag grid. */
export function TeamGrid({
  seasonId,
  selectedId,
  onSelect,
}: {
  /** Teams = those appearing in this season's fixtures (teams carry no season). */
  seasonId: string;
  selectedId: number | null;
  onSelect: (team: TeamOption) => void;
}) {
  const [teams, setTeams] = useState<TeamOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const { data: fx } = await supabase
        .from('fixtures')
        .select('home_team, away_team')
        .eq('season_id', seasonId);
      const ids = [
        ...new Set(
          ((fx ?? []) as { home_team: number; away_team: number }[]).flatMap((f) => [
            f.home_team,
            f.away_team,
          ])
        ),
      ];
      const { data } = ids.length
        ? await supabase.from('teams').select('id, name, code, flag_url').in('id', ids).order('name')
        : { data: [] };
      if (!cancelled) setTeams((data as TeamOption[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  if (teams === null) {
    return (
      <View className="flex-row flex-wrap gap-md p-md">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} circle height={52} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={teams}
      numColumns={4}
      keyExtractor={(t) => String(t.id)}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pb-xl"
      renderItem={({ item: t }) => {
        const active = selectedId === t.id;
        return (
          <Pressable
            onPress={() => onSelect(t)}
            className={`m-xs flex-1 items-center gap-xs rounded-lg border p-sm ${
              active ? 'border-primary bg-primary/15' : 'border-transparent'
            }`}
          >
            <FlagBadge uri={t.flag_url} code={t.code} size={44} live={active} />
            <Text
              className={`text-xs font-semibold ${active ? 'text-primary' : 'text-textMuted'}`}
              numberOfLines={1}
            >
              {t.code}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

/** Steps 2–3 — searchable player list (optionally GK-only for the keeper pick). */
export function PlayerSearchList({
  gkOnly,
  outfieldOnly = false,
  seasonId,
  selectedId,
  onSelect,
}: {
  seasonId: string;
  gkOnly: boolean;
  /** Hide goalkeepers (an outfield-player pick). */
  outfieldOnly?: boolean;
  selectedId: number | null;
  onSelect: (player: PlayerOption) => void;
}) {
  const c = useThemeColors();
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let q = getSupabase()
        .from('players')
        .select('id, name, image_url, position, team:teams(code, flag_url)')
        .eq('season_id', seasonId)
        .order('name')
        .limit(50);
      if (gkOnly) q = q.eq('position', 'GK');
      if (outfieldOnly) q = q.neq('position', 'GK');
      if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);
      const { data } = await q;
      if (!cancelled) setPlayers((data as unknown as PlayerOption[]) ?? []);
    };
    const t = setTimeout(run, 200); // debounce typing
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [seasonId, gkOnly, outfieldOnly, query]);

  return (
    <View className="flex-1 gap-md">
      <View className="h-11 flex-row items-center gap-sm rounded-lg border border-border bg-surface px-md">
        <Search size={16} color={c.textFaint} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={gkOnly ? 'Search keepers' : 'Search all players'}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          className="flex-1 text-base text-text"
        />
      </View>

      {players === null ? (
        <View className="gap-md pt-sm">
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} className="flex-row items-center gap-md">
              <Skeleton circle height={40} />
              <Skeleton width="50%" height={14} />
            </View>
          ))}
        </View>
      ) : players.length === 0 ? (
        <EmptyState icon={Search} title="No players found" message="Try a different name." />
      ) : (
        <FlatList
          data={players}
          keyExtractor={(p) => String(p.id)}
          showsVerticalScrollIndicator={false}
          contentContainerClassName="pb-xl"
          renderItem={({ item: p }) => {
            const active = selectedId === p.id;
            return (
              <Pressable
                onPress={() => onSelect(p)}
                className={`flex-row items-center gap-md rounded-lg border-b border-border/50 px-xs py-sm ${
                  active ? 'bg-primary/10' : 'active:bg-surface'
                }`}
              >
                <Avatar uri={p.image_url} name={p.name} size={40} />
                <View className="flex-1">
                  <Text
                    className={`text-base font-semibold ${active ? 'text-primary' : 'text-text'}`}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Text className="text-xs text-textMuted">{p.position}</Text>
                </View>
                <FlagBadge uri={p.team.flag_url} code={p.team.code} size={24} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
