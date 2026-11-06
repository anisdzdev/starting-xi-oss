import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, Screen, Skeleton, TextField } from '@/components';
import { SpanPicker } from '@/features/competitions/SpanPicker';
import {
  createCompetition,
  type CompetitionMetric,
  type PickKind,
  type Span,
} from '@/features/competitions';
import { useRounds } from '@/features/rounds';
import { useActiveSeason } from '@/features/seasons';
import { currentGameDay } from '@/shared/gameday';
import { useThemeColors } from '@/theme';

type Goal = { metric: CompetitionMetric; pickKind: PickKind | null; label: string; hint: string };

const GOALS: Goal[] = [
  { metric: 'xi', pickKind: null, label: 'Best XI', hint: 'Your daily XI totals over the span.' },
  { metric: 'pick', pickKind: 'keeper', label: 'Keeper pick', hint: 'Everyone names one goalkeeper when joining.' },
  { metric: 'pick', pickKind: 'player', label: 'Player pick', hint: 'Everyone names one outfield player when joining.' },
];

/** Create a competition: name, goal, span of rounds, reward. */
export default function NewCompetitionScreen() {
  const c = useThemeColors();
  const season = useActiveSeason();
  const rounds = useRounds(season?.id ?? null);
  const today = currentGameDay();

  const [name, setName] = useState('');
  const [reward, setReward] = useState('');
  const [goal, setGoal] = useState<Goal>(GOALS[0]);
  const [span, setSpan] = useState<Span | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && !!span && !!season && !busy;

  const submit = async () => {
    if (!season || !span) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createCompetition({
        seasonId: season.id,
        name,
        reward: reward.trim() || null,
        metric: goal.metric,
        pickKind: goal.pickKind,
        fromRound: span.from,
        toRound: span.to,
      });
      router.replace(`/competitions/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the competition');
      setBusy(false);
    }
  };

  return (
    <Screen glow="hype" edges={[]}>
      <Stack.Screen options={{ title: 'New competition' }} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Best of Matchday 3"
          maxLength={60}
        />

        <View className="gap-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">Goal</Text>
          <View className="gap-sm">
            {GOALS.map((g) => {
              const selected = g.label === goal.label;
              return (
                <Pressable
                  key={g.label}
                  onPress={() => setGoal(g)}
                  className="rounded-xl border px-md py-md active:opacity-80"
                  style={{
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.surfaceRaised : c.surface,
                  }}
                >
                  <Text className="text-base font-semibold text-text">{g.label}</Text>
                  <Text className="text-xs text-textMuted">{g.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-sm">
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
            Which rounds
          </Text>
          {rounds === null ? (
            <Skeleton height={44} radius={12} />
          ) : (
            <SpanPicker rounds={rounds} value={span} onChange={setSpan} minStartsOn={today} />
          )}
        </View>

        <TextField
          label="Reward (optional)"
          value={reward}
          onChangeText={setReward}
          placeholder="e.g. Loser buys dinner"
          maxLength={140}
        />

        <Card variant="glass">
          <Text className="text-sm text-textMuted">
            Anyone can join until the first kickoff of the span. After that the field is locked and
            nobody can join, leave or change a pick.
          </Text>
        </Card>

        {error ? (
          <Text className="text-sm" style={{ color: c.danger }}>
            {error}
          </Text>
        ) : null}

        <Button title={busy ? 'Creating…' : 'Create competition'} onPress={submit} disabled={!canSubmit} />
      </ScrollView>
    </Screen>
  );
}
