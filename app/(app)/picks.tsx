import { router, Stack } from 'expo-router';
import { Lock, Shield, Star, Hand } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, Button, Card, FlagBadge, Screen, Skeleton } from '@/components';
import {
  savePicks,
  useTournamentPicks,
  type MyPicks,
  type PickPoints,
} from '@/features/picks/useTournamentPicks';
import { PlayerSearchList, TeamGrid, type PlayerOption, type TeamOption } from '@/features/picks/PickSteps';
import { useActiveSeason } from '@/features/seasons';
import { GAME_DAY_TZ } from '@/shared/gameday';
import { useThemeColors } from '@/theme';

/** Deadline shown in the league's timezone, e.g. "Jun 18, 12:00 PM ET". */
function formatDeadline(ms: number): string {
  return (
    new Date(ms).toLocaleString('en-US', {
      timeZone: GAME_DAY_TZ,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

type Step = 'team' | 'player' | 'keeper';
const STEP_TITLES: Record<Step, [string, string]> = {
  team: ['Team of the Tournament', 'Wins, draws and deep runs earn you points all month.'],
  player: ['Player of the Tournament', 'Their FPL points count for you every match.'],
  keeper: ['Keeper of the Tournament', 'Clean sheets and saves — pick a busy wall.'],
};

function SummaryRow({
  icon: Icon,
  label,
  image,
  name,
  points,
}: {
  icon: typeof Shield;
  label: string;
  image: React.ReactNode;
  name: string;
  points: number | null;
}) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center gap-md">
      <Icon size={16} color={c.textFaint} strokeWidth={2} />
      {image}
      <View className="flex-1">
        <Text className="text-xs uppercase tracking-widest text-textFaint">{label}</Text>
        <Text className="text-base font-semibold text-text" numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text className="text-lg font-bold text-primary">{points ?? 0}</Text>
    </View>
  );
}

function Summary({
  picks,
  points,
  locked,
  deadline,
  onEdit,
}: {
  picks: MyPicks;
  points: PickPoints;
  locked: boolean;
  deadline: number;
  onEdit: () => void;
}) {
  const c = useThemeColors();
  return (
    <View className="gap-lg px-xl py-xl">
      <View className="gap-xs">
        <Text className="text-2xl font-bold text-text">Tournament picks</Text>
        {locked ? (
          <View className="flex-row items-center gap-xs">
            <Lock size={13} color={c.warning} strokeWidth={2.2} />
            <Text className="text-sm text-warning">
              Locked for the tournament — picks closed {formatDeadline(deadline)}
            </Text>
          </View>
        ) : (
          <Text className="text-sm text-textMuted">
            You can change these until {formatDeadline(deadline)}.
          </Text>
        )}
      </View>

      <Card variant="elevated" className="gap-lg">
        <SummaryRow
          icon={Shield}
          label="Team"
          image={<FlagBadge uri={picks.team?.flag_url} code={picks.team?.code} size={36} />}
          name={picks.team?.name ?? '—'}
          points={points.team}
        />
        <SummaryRow
          icon={Star}
          label="Player"
          image={<Avatar uri={picks.player?.image_url} name={picks.player?.name} size={36} />}
          name={picks.player?.name ?? '—'}
          points={points.player}
        />
        <SummaryRow
          icon={Hand}
          label="Keeper"
          image={<Avatar uri={picks.keeper?.image_url} name={picks.keeper?.name} size={36} />}
          name={picks.keeper?.name ?? '—'}
          points={points.keeper}
        />
      </Card>

      {!locked ? <Button title="Change picks" variant="ghost" onPress={onEdit} /> : null}
    </View>
  );
}

export default function PicksScreen() {
  // Picks belong to the active season (only seasons flagged has_tournament_picks).
  const season = useActiveSeason();
  const seasonId = season?.hasTournamentPicks ? season.id : null;
  const { picks, points, deadline, locked, loading, hasPicks, refresh } =
    useTournamentPicks(seasonId);

  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<Step>('team');
  const [team, setTeam] = useState<TeamOption | null>(null);
  const [player, setPlayer] = useState<PlayerOption | null>(null);
  const [keeper, setKeeper] = useState<PlayerOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blocking onboarding: no back navigation until picks exist.
  const blocking = !hasPicks && !locked;
  const showPickers = (editing || blocking) && !locked && !loading;

  const stepIndex = step === 'team' ? 1 : step === 'player' ? 2 : 3;
  const canContinue = step === 'team' ? !!team : step === 'player' ? !!player : !!keeper;

  const advance = async () => {
    setError(null);
    if (step === 'team') setStep('player');
    else if (step === 'player') setStep('keeper');
    else {
      setSaving(true);
      try {
        if (!seasonId) throw new Error('Picks are not open this season');
        await savePicks(seasonId, team!.id, player!.id, keeper!.id);
        await refresh();
        setEditing(false);
        setStep('team');
        if (blocking) router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your picks.');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <Screen glow="hype" edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Tournament picks',
          headerBackVisible: !blocking,
          gestureEnabled: !blocking,
        }}
      />

      {loading ? (
        <View className="gap-md px-xl py-xl">
          <Skeleton width="60%" height={22} />
          <Skeleton width="100%" height={180} radius={20} />
        </View>
      ) : showPickers ? (
        <View className="flex-1 gap-md px-xl pt-lg">
          <View className="gap-xs">
            <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
              Step {stepIndex} of 3
            </Text>
            <Text className="text-xl font-bold text-text">{STEP_TITLES[step][0]}</Text>
            <Text className="text-sm text-textMuted">{STEP_TITLES[step][1]}</Text>
          </View>

          <View className="flex-1">
            {step === 'team' ? (
              <TeamGrid seasonId={seasonId!} selectedId={team?.id ?? null} onSelect={setTeam} />
            ) : step === 'player' ? (
              <PlayerSearchList
                seasonId={seasonId!}
                gkOnly={false}
                selectedId={player?.id ?? null}
                onSelect={setPlayer}
              />
            ) : (
              <PlayerSearchList
                seasonId={seasonId!}
                gkOnly
                selectedId={keeper?.id ?? null}
                onSelect={setKeeper}
              />
            )}
          </View>

          {error ? <Text className="text-sm text-danger">{error}</Text> : null}
          <View className="gap-sm pb-md">
            <Button
              title={step === 'keeper' ? 'Lock in my picks' : 'Continue'}
              disabled={!canContinue}
              loading={saving}
              onPress={advance}
            />
            {step !== 'team' ? (
              <Button
                title="Back"
                variant="ghost"
                onPress={() => setStep(step === 'keeper' ? 'player' : 'team')}
              />
            ) : null}
          </View>
        </View>
      ) : hasPicks && picks !== 'none' && picks !== null ? (
        <Summary
          picks={picks}
          points={points}
          locked={locked}
          deadline={deadline}
          onEdit={() => {
            setTeam(picks.team as TeamOption | null);
            setPlayer(picks.player ? { ...picks.player, position: '', team: { code: '', flag_url: null } } : null);
            setKeeper(picks.keeper ? { ...picks.keeper, position: 'GK', team: { code: '', flag_url: null } } : null);
            setEditing(true);
            setStep('team');
          }}
        />
      ) : (
        // No picks AND locked: joined after the deadline. No picker (picking after
        // GW1 results would be unfair) — but not blocked from the rest of the app.
        <View className="px-xl py-xl">
          <Card variant="glass">
            <Text className="text-base font-semibold text-text">Picks closed</Text>
            <Text className="text-sm text-textMuted">
              Tournament picks closed {formatDeadline(deadline)}. You joined after the
              deadline, so you don&apos;t have picks for this tournament.
            </Text>
          </Card>
        </View>
      )}
    </Screen>
  );
}
