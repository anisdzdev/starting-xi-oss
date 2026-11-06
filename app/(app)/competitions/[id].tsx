import { format, parseISO } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Crown, Gift, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Skeleton } from '@/components';
import { useSession } from '@/features/auth/session-context';
import { StatusPill } from '@/features/competitions/CompetitionCard';
import { PickSheet } from '@/features/competitions/PickSheet';
import {
  deleteCompetition,
  goalLabel,
  joinCompetition,
  leaveCompetition,
  setPick,
  useCompetition,
} from '@/features/competitions';
import { BoardRowItem } from '@/features/leaderboard/BoardRowItem';
import { useRounds } from '@/features/rounds';
import { GAME_DAY_TZ } from '@/shared/gameday';
import { useThemeColors } from '@/theme';

/** Confirm on native; window.confirm on web (RN's Alert is a no-op there). */
function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

function kickoffText(iso: string | null): string {
  if (!iso) return 'the first kickoff';
  return (
    new Date(iso).toLocaleString('en-US', {
      timeZone: GAME_DAY_TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

/** One competition: header card, winner banner, standings, join / pick / leave / delete. */
export default function CompetitionScreen() {
  const c = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const meId = session?.user.id ?? null;
  const { competition: comp, standings, missing, loading, refresh } = useCompetition(id ?? null);
  const rounds = useRounds(comp?.seasonId ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <Screen glow="hype" edges={[]}>
        <Stack.Screen options={{ title: 'Competition' }} />
        <EmptyState icon={Trophy} title="Competition not found" message="It may have been deleted by its creator." />
      </Screen>
    );
  }

  if (loading || !comp || !standings) {
    return (
      <Screen glow="hype" edges={[]}>
        <Stack.Screen options={{ title: 'Competition' }} />
        <View className="gap-md p-xl">
          <Skeleton height={140} radius={16} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={56} radius={12} />
        </View>
      </Screen>
    );
  }

  // Lock follows the SERVER-derived status (refetched on realtime stat changes and on
  // every action), so once the pill says Live the buttons go too. No fixtures in the
  // span yet (null kickoff) also means nothing to join. The trigger stays the real gate.
  const locked = comp.status !== 'open' || !comp.firstKickoff;
  const isCreator = comp.createdBy === meId;
  const winners =
    comp.status === 'finished' ? standings.filter((s) => s.rank === 1 && s.points > 0) : [];
  // A competition whose rounds vanished (re-ingested keys) has no span: never parseISO('').
  const when = !comp.startsOn
    ? 'Rounds not available'
    : comp.startsOn === comp.endsOn
      ? format(parseISO(comp.startsOn), 'EEE, MMM d')
      : `${format(parseISO(comp.startsOn), 'MMM d')} – ${format(parseISO(comp.endsOn), 'MMM d')}`;

  const onJoin = () => {
    if (comp.metric === 'pick') setPickOpen(true);
    else run(() => joinCompetition(comp.id, null));
  };

  return (
    <Screen glow={comp.status === 'live' ? 'live' : 'hype'} edges={[]}>
      <Stack.Screen options={{ title: comp.name }} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Card variant="glass" className="gap-sm">
          <View className="flex-row items-center gap-sm">
            <Text className="flex-1 text-xl font-bold text-text">{comp.name}</Text>
            <StatusPill status={comp.status} />
          </View>
          <Text className="text-base text-text">{goalLabel(comp, rounds ?? [])}</Text>
          <Text className="text-sm text-textMuted">
            {when} · {comp.memberCount} in · by {comp.creatorName}
          </Text>
          {comp.reward ? (
            <View className="flex-row items-center gap-xs">
              <Gift size={16} color={c.captain} strokeWidth={2.2} />
              <Text className="text-base font-semibold text-text">{comp.reward}</Text>
            </View>
          ) : null}
          <Text className="text-xs text-textFaint">
            {comp.status === 'open'
              ? `Joins close at ${kickoffText(comp.firstKickoff)}.`
              : comp.status === 'live'
                ? 'Locked — in play.'
                : 'Final.'}
          </Text>
        </Card>

        {winners.length > 0 ? (
          <Card variant="elevated" className="flex-row items-center gap-md">
            <Crown size={22} color={c.captain} strokeWidth={2.2} />
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
                {winners.length > 1 ? 'Winners' : 'Winner'}
              </Text>
              <Text className="text-base font-bold text-text">
                {winners.map((w) => w.name).join(' & ')} · {winners[0].points} pts
              </Text>
            </View>
          </Card>
        ) : null}

        {/* actions */}
        {!locked ? (
          <View className="gap-sm">
            {comp.me.joined ? (
              <>
                {comp.metric === 'pick' ? (
                  <Button title="Change my pick" variant="ghost" onPress={() => setPickOpen(true)} disabled={busy} />
                ) : null}
                <Button
                  title="Leave competition"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => confirm('Leave?', 'You can rejoin until the first kickoff.', () => run(() => leaveCompetition(comp.id)))}
                />
              </>
            ) : (
              <Button title={comp.metric === 'pick' ? 'Join — choose your pick' : 'Join'} onPress={onJoin} disabled={busy} />
            )}
            {isCreator ? (
              <Button
                title="Delete competition"
                variant="danger"
                disabled={busy}
                onPress={() =>
                  confirm('Delete this competition?', 'Everyone who joined is removed. This cannot be undone.', async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await deleteCompetition(comp.id);
                      // leave without refetching a row that no longer exists
                      if (router.canGoBack()) router.back();
                      else router.replace('/competitions');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not delete');
                      setBusy(false);
                    }
                  })
                }
              />
            ) : null}
          </View>
        ) : null}

        {error ? (
          <Text className="text-sm" style={{ color: c.danger }}>
            {error}
          </Text>
        ) : null}

        <View className="gap-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
            Standings
          </Text>
          {standings.length === 0 ? (
            <Text className="text-sm text-textMuted">Nobody has joined yet.</Text>
          ) : (
            standings.map((s) => (
              <BoardRowItem
                key={s.userId}
                row={{
                  userId: s.userId,
                  name: s.name,
                  avatarUrl: s.avatarUrl,
                  pickImageUrl: s.pickImageUrl,
                  sub:
                    comp.metric === 'pick'
                      ? (s.pickName ?? 'No pick')
                      : `${s.played} day${s.played === 1 ? '' : 's'} played`,
                  points: s.points,
                  rank: s.rank,
                  movement: null,
                }}
              />
            ))
          )}
        </View>
      </ScrollView>

      {comp.metric === 'pick' && comp.pickKind ? (
        <PickSheet
          visible={pickOpen}
          seasonId={comp.seasonId}
          kind={comp.pickKind}
          selectedId={comp.me.pickPlayerId}
          busy={busy}
          onClose={() => setPickOpen(false)}
          onConfirm={(player) => {
            setPickOpen(false);
            run(() =>
              comp.me.joined ? setPick(comp.id, player.id) : joinCompetition(comp.id, player.id)
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
