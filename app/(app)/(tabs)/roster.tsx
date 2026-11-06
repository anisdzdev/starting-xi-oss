import { CalendarClock, ChevronDown, Lock } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';

import { BottomSheet, Button, Screen, ScoringInfoButton, Skeleton } from '@/components';
import { LiveRosterView } from '@/features/live/LiveRosterView';
import { useActiveGameDay } from '@/features/live/useActiveGameDay';
import { type Fixture, type TeamLite } from '@/features/live/useGameDay';
import { loadRoster, saveRoster, validateRoster } from '@/features/roster/api';
import { BenchTray } from '@/features/roster/BenchTray';
import { CoachOfTheDay } from '@/features/roster/CoachOfTheDay';
import { FlyingChip } from '@/features/roster/FlyingChip';
import { FormationCard } from '@/features/roster/FormationCard';
import { FORMATIONS, slotLayout } from '@/features/roster/formations';
import { Pitch } from '@/features/roster/Pitch';
import { PlayerCardSheet } from '@/features/roster/PlayerCardSheet';
import { PlayerPicker } from '@/features/roster/PlayerPicker';
import { PlayerSlot } from '@/features/roster/PlayerSlot';
import { useRosterBuilder, type PickedPlayer } from '@/features/roster/store';
import { seasonOfDay, useSeasons } from '@/features/seasons';
import { getSupabase } from '@/lib/supabase';
import { currentGameDay } from '@/shared/gameday';
import type { Position } from '@/shared/scoring';
import { useThemeColors } from '@/theme';

/** Step 1: pick a shape. */
function FormationPicker() {
  const setFormation = useRosterBuilder((s) => s.setFormation);
  return (
    <Screen glow="pitch" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-xl px-xl py-xl">
        <View className="gap-xs">
          <Text className="text-2xl font-bold text-text">Pick your shape</Text>
          <Text className="text-sm text-textMuted">
            You can change it later — players keep their spots where the lines still fit.
          </Text>
        </View>
        <View className="flex-row flex-wrap justify-between gap-md">
          {FORMATIONS.map((f) => (
            <View key={f.code} className="w-[47%]">
              <FormationCard formation={f} selected={false} onPress={() => setFormation(f.code)} />
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Dev-only: fill empty slots with ELIGIBLE players (teams playing today). */
async function devAutofill(gameDay: string, seasonId: string | null) {
  const supabase = getSupabase();
  const { data: todays } = await supabase
    .from('fixtures')
    .select('home_team, away_team')
    .eq('game_day', gameDay);
  const teamIds = [...new Set((todays ?? []).flatMap((f) => [f.home_team, f.away_team]))];
  let q = supabase
    .from('players')
    .select('id, name, position, image_url, team:teams(code, flag_url)')
    .in('team_id', teamIds);
  if (seasonId) q = q.eq('season_id', seasonId); // one players row per season
  const { data } = await q.limit(80);
  if (!data) return;
  const state = useRosterBuilder.getState();
  const layout = slotLayout(state.formationCode!);
  const pool = [...data] as unknown as {
    id: number;
    name: string;
    position: Position;
    image_url: string | null;
    team: { code: string; flag_url: string | null };
  }[];
  for (const point of layout) {
    if (state.slots[point.slot - 1]) continue;
    const i = pool.findIndex((p) => p.position === point.position);
    if (i < 0) continue;
    const [p] = pool.splice(i, 1);
    useRosterBuilder.getState().assign(point.slot, {
      id: p.id,
      name: p.name,
      position: p.position,
      imageUrl: p.image_url,
      teamCode: p.team.code,
      flagUrl: p.team.flag_url,
    });
  }
}

/** Step 2: the pitch. */
function PitchView({
  formationCode,
  buildDay,
  fixtures,
  lateBuild,
  onSaved,
}: {
  formationCode: string;
  buildDay: string;
  fixtures: Fixture[] | null;
  /** Building AFTER the first kickoff (missed the deadline): only not-yet-started
   *  teams are pickable, and saving locks the team immediately. */
  lateBuild: boolean;
  /** Called after a successful save so the screen can re-evaluate the lock. */
  onSaved: () => void;
}) {
  // Season of the build day: scopes the picker to this season's player rows.
  const seasons = useSeasons();
  const buildSeasonId = seasonOfDay(seasons, buildDay)?.id ?? null;
  const slots = useRosterBuilder((s) => s.slots);
  const bench = useRosterBuilder((s) => s.bench);
  const captainId = useRosterBuilder((s) => s.captainId);
  const setFormation = useRosterBuilder((s) => s.setFormation);
  const placeFromBench = useRosterBuilder((s) => s.placeFromBench);
  const clearSlot = useRosterBuilder((s) => s.clearSlot);
  const setCaptain = useRosterBuilder((s) => s.setCaptain);

  const assign = useRosterBuilder((s) => s.assign);
  const c = useThemeColors();

  const [formationSheet, setFormationSheet] = useState(false);
  const [pressedSlot, setPressedSlot] = useState<number | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [inspectId, setInspectId] = useState<number | null>(null);
  const [flight, setFlight] = useState<{ player: PickedPlayer; slot: number } | null>(null);
  const [pitchSize, setPitchSize] = useState<{ w: number; h: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Teams playing on the build day. `fixtures` is the build day's slate (passed
  // from RosterScreen via useActiveGameDay), so the shared EST game-day rule and
  // the "next day after the last match" advance both flow through here.
  const playingTeams = useMemo(() => {
    const map = new Map<number, TeamLite>();
    for (const f of fixtures ?? []) {
      map.set(f.home.id, f.home);
      map.set(f.away.id, f.away);
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [fixtures]);

  // Lock time = first kickoff of the day, regardless of match status.
  const lockTime = useMemo(() => {
    const times = (fixtures ?? []).map((f) => new Date(f.kickoff_utc).getTime());
    return times.length > 0 ? Math.min(...times) : null;
  }, [fixtures]);
  const timeLocked = lockTime !== null && Date.now() >= lockTime;
  // A late builder keeps editing after the lock (until they save); everyone else is
  // read-only once the day has started.
  const readonly = timeLocked && !lateBuild;

  // While building late, re-evaluate team eligibility periodically (a later match
  // crossing its kickoff removes that team from the picker).
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!lateBuild) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [lateBuild]);

  // re-render the moment the lock kicks in (read-only flip for non-exception users)
  useEffect(() => {
    if (lockTime === null || Date.now() >= lockTime) return;
    const id = setTimeout(() => forceTick((t) => t + 1), lockTime - Date.now() + 500);
    return () => clearTimeout(id);
  }, [lockTime]);

  // Earliest kickoff per team on the build day.
  const teamKickoff = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of fixtures ?? []) {
      const k = new Date(f.kickoff_utc).getTime();
      m.set(f.home.id, Math.min(m.get(f.home.id) ?? Infinity, k));
      m.set(f.away.id, Math.min(m.get(f.away.id) ?? Infinity, k));
    }
    return m;
  }, [fixtures]);

  // Teams still pickable (kickoff in the future). Pre-lock this is every team, so
  // normal users are unaffected; under an exception it shrinks as matches start.
  const eligibleTeams = useMemo(
    () =>
      playingTeams.filter(
        // eslint-disable-next-line react-hooks/purity -- nowTick drives re-evaluation of Date.now()
        (t) => (teamKickoff.get(t.id) ?? Infinity) > Date.now()
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowTick re-evaluates Date.now()
    [playingTeams, teamKickoff, nowTick]
  );
  const startedTeamCodes = useMemo(
    () =>
      new Set(
        playingTeams
          .filter(
            // eslint-disable-next-line react-hooks/purity -- nowTick drives re-evaluation of Date.now()
            (t) => (teamKickoff.get(t.id) ?? Infinity) <= Date.now()
          )
          .map((t) => t.code)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowTick re-evaluates Date.now()
    [playingTeams, teamKickoff, nowTick]
  );

  const pickedIds = useMemo(
    () =>
      new Set([
        ...(slots.filter(Boolean) as PickedPlayer[]).map((p) => p.id),
        ...bench.map((p) => p.id),
      ]),
    [slots, bench]
  );

  // edits after a save flip the button back to "Save XI"
  useEffect(() => {
    setSaveState((prev) => (prev === 'saved' ? 'idle' : prev));
    setSaveError(null);
  }, [slots, captainId, formationCode]);

  const layout = slotLayout(formationCode);
  const pickedCount = slots.filter(Boolean).length;
  const pressedPlayer = pressedSlot !== null ? slots[pressedSlot - 1] : null;
  const pickerPosition = pickerSlot !== null ? layout[pickerSlot - 1].position : null;

  return (
    <Screen glow="pitch" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-xl py-md">
        {/* Tap the formation header to re-open the shape picker (pre-lock only). */}
        <Pressable
          disabled={readonly}
          onPress={() => setFormationSheet(true)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Change formation"
        >
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
            {buildDay !== currentGameDay()
              ? `Building for ${format(parseISO(buildDay), 'EEE, MMM d')}`
              : 'Formation'}
          </Text>
          <View className="flex-row items-center gap-xs">
            <Text className="text-xl font-bold text-text">{formationCode}</Text>
            {!readonly ? <ChevronDown size={20} color={c.textMuted} strokeWidth={2.4} /> : null}
          </View>
        </Pressable>
        <View className="flex-row items-center gap-md">
          <Text className="text-sm font-semibold text-textMuted">{pickedCount}/11</Text>
          {timeLocked ? <LockedBadge lockTime={lockTime!} /> : null}
          <ScoringInfoButton />
        </View>
      </View>

      {lateBuild ? (
        <View className="mx-xl mb-sm flex-row items-center gap-sm rounded-lg border border-primary/40 bg-primary/10 px-md py-sm">
          <Lock size={14} color={c.primary} strokeWidth={2.2} />
          <Text className="flex-1 text-xs text-textMuted">
            The first match has started — you can only pick teams that haven&apos;t kicked
            off yet, and your XI locks as soon as you save.
          </Text>
        </View>
      ) : null}

      <CoachOfTheDay
        gameDay={buildDay}
        firstKickoffPassed={timeLocked}
        playingTeams={playingTeams}
        startedTeamCodes={startedTeamCodes}
      />

      <Pitch
        style={{ flex: 1, marginHorizontal: 12, marginBottom: 12 }}
        onLayout={(e) =>
          setPitchSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {layout.map((point) => (
          <PlayerSlot
            key={point.slot}
            position={point.position}
            player={slots[point.slot - 1]}
            isCaptain={!!slots[point.slot - 1] && slots[point.slot - 1]!.id === captainId}
            x={point.x}
            y={point.y}
            onPress={() => {
              if (readonly) return;
              if (slots[point.slot - 1]) setPressedSlot(point.slot);
              else setPickerSlot(point.slot);
            }}
          />
        ))}
        {flight && pitchSize ? (
          <FlyingChip
            player={flight.player}
            from={{ x: pitchSize.w / 2, y: pitchSize.h + 40 }}
            to={{
              x: (layout[flight.slot - 1].x / 100) * pitchSize.w,
              y: (layout[flight.slot - 1].y / 100) * pitchSize.h,
            }}
            onArrive={() => {
              assign(flight.slot, flight.player);
              setFlight(null);
            }}
          />
        ) : null}
      </Pitch>

      {!readonly ? <BenchTray players={bench} onPlace={placeFromBench} /> : null}

      {!readonly ? (
        <View className="gap-sm px-xl py-sm">
          {saveError ? <Text className="text-sm text-danger">{saveError}</Text> : null}
          <Button
            title={
              lateBuild
                ? 'Save & lock XI'
                : saveState === 'saved'
                  ? 'Saved — edit anytime before kickoff'
                  : 'Save XI'
            }
            loading={saveState === 'saving'}
            onPress={async () => {
              setSaveError(null);
              const codes = new Set(playingTeams.map((t) => t.code));
              const problem = validateRoster(formationCode, slots, captainId, codes, startedTeamCodes);
              if (problem) {
                setSaveError(problem);
                return;
              }
              setSaveState('saving');
              try {
                await saveRoster(buildDay, formationCode, slots, captainId!, lateBuild);
                setSaveState('saved');
                // Late saves lock immediately; notify so the screen re-evaluates.
                onSaved();
              } catch (e) {
                setSaveState('idle');
                setSaveError(e instanceof Error ? e.message : 'Save failed.');
              }
            }}
          />
          {__DEV__ ? (
            <Button
              title="Auto-fill XI (dev)"
              variant="ghost"
              onPress={() => devAutofill(buildDay, buildSeasonId)}
            />
          ) : null}
        </View>
      ) : null}

      {/* formation switcher */}
      <BottomSheet visible={formationSheet} onClose={() => setFormationSheet(false)}>
        <View className="gap-md pb-lg">
          <Text className="text-lg font-semibold text-text">Switch formation</Text>
          <Text className="text-sm text-textMuted">
            Players keep their spots where the lines still fit — the rest go to the bench tray.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-md py-sm">
            {FORMATIONS.map((f) => (
              <FormationCard
                key={f.code}
                formation={f}
                selected={f.code === formationCode}
                onPress={() => {
                  setFormation(f.code);
                  setFormationSheet(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BottomSheet>

      {/* player picker for empty slots */}
      <PlayerPicker
        visible={pickerSlot !== null}
        position={pickerPosition}
        playingTeams={eligibleTeams}
        seasonId={buildSeasonId}
        pickedIds={pickedIds}
        onClose={() => setPickerSlot(null)}
        onPick={(player) => {
          const slot = pickerSlot!;
          setPickerSlot(null);
          setFlight({ player, slot });
        }}
        onInspect={(playerId) => {
          setPickerSlot(null);
          setInspectId(playerId);
        }}
      />

      {/* filled-slot player card (photo, opponent, scout report, actions) */}
      <PlayerCardSheet
        playerId={pressedPlayer?.id ?? null}
        onClose={() => setPressedSlot(null)}
        slotActions={
          pressedPlayer
            ? {
                isCaptain: pressedPlayer.id === captainId,
                onToggleCaptain: () => {
                  setCaptain(pressedPlayer.id === captainId ? null : pressedPlayer.id);
                  setPressedSlot(null);
                },
                onRemove: () => {
                  clearSlot(pressedSlot!);
                  setPressedSlot(null);
                },
              }
            : null
        }
      />

      {/* long-press inspect from the picker (no slot actions) */}
      <PlayerCardSheet playerId={inspectId} onClose={() => setInspectId(null)} />
    </Screen>
  );
}

function LockedBadge({ lockTime }: { lockTime: number }) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center gap-xs rounded-full border border-border bg-surface px-md py-xs">
      <Lock size={13} color={c.warning} strokeWidth={2.2} />
      <Text className="text-xs font-semibold text-warning">
        Locked ·{' '}
        {new Date(lockTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </Text>
    </View>
  );
}

/**
 * Missed the deadline AND every team has already kicked off — there's nothing left to
 * pick, so show a friendly "too late" message over the pitch (no formation picker, no
 * empty "+" slots). A latecomer with teams still to come gets the editable builder.
 */
function LatecomerState({ buildDay, lockTime }: { buildDay: string; lockTime: number | null }) {
  const c = useThemeColors();
  const isToday = buildDay === currentGameDay();
  const dayLabel = isToday ? "Today's games" : format(parseISO(buildDay), 'EEE, MMM d');

  return (
    <Screen glow="pitch" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-xl py-md">
        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
            Build your XI
          </Text>
          <Text className="text-xl font-bold text-text">{dayLabel}</Text>
        </View>
        {lockTime ? <LockedBadge lockTime={lockTime} /> : null}
      </View>

      <Pitch style={{ flex: 1, marginHorizontal: 12, marginBottom: 12 }}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center', padding: 24 },
          ]}
        >
          <View className="items-center gap-md rounded-2xl border border-borderGlass bg-surfaceGlass px-xl py-2xl">
            <View className="h-[64px] w-[64px] items-center justify-center rounded-full border border-border bg-surface">
              <CalendarClock size={28} color={c.textMuted} strokeWidth={1.8} />
            </View>
            <Text className="text-center text-lg font-semibold text-text">
              {isToday ? 'Too late for today' : 'This day is locked'}
            </Text>
            <Text className="max-w-[260px] text-center text-sm text-textMuted">
              Every match {isToday ? 'today' : 'that day'} has kicked off, so there are no
              teams left to pick. Come back for the next game day to build your XI.
            </Text>
          </View>
        </View>
      </Pitch>
    </Screen>
  );
}

export default function RosterScreen() {
  const formationCode = useRosterBuilder((s) => s.formationCode);
  const hydrate = useRosterBuilder((s) => s.hydrate);
  const { buildDay, fixtures, resolving } = useActiveGameDay();
  const [restoring, setRestoring] = useState(true);
  const [hasSaved, setHasSaved] = useState<boolean | null>(null);
  const [, forceTick] = useState(0);

  // Resume a previously saved XI for the build day (unlimited edits before lock),
  // and record whether one exists so a locked day can show the live XI vs the
  // latecomer state.
  useEffect(() => {
    if (resolving) return; // wait until the build day is known
    let cancelled = false;
    (async () => {
      const saved = await loadRoster(buildDay);
      if (cancelled) return;
      setHasSaved(saved !== null);
      // don't clobber an in-progress local build
      if (useRosterBuilder.getState().formationCode === null && saved) {
        hydrate(saved.formationCode, saved.players, saved.captainId);
      }
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, buildDay, resolving]);

  // First kickoff of the build day (over ALL fixtures, any status).
  const lockTime = useMemo(() => {
    const times = (fixtures ?? []).map((f) => new Date(f.kickoff_utc).getTime());
    return times.length > 0 ? Math.min(...times) : null;
  }, [fixtures]);
  const firstKickoffPassed = lockTime !== null && Date.now() >= lockTime;

  // Universal late entry: once the day has started, a roster that's already on record
  // is locked (read-only); a user who missed the deadline with no team yet can still
  // build one — but only with teams that haven't kicked off, and it locks on save.
  const locked = firstKickoffPassed && hasSaved === true;
  const lateBuild = firstKickoffPassed && hasSaved === false;
  // If every team has already kicked off there's nothing left to pick — show the
  // "too late" state instead of an unfillable builder.
  const anyTeamOpen = (fixtures ?? []).some(
    // eslint-disable-next-line react-hooks/purity -- intentional now() read; re-renders at kickoff via the timer below
    (f) => new Date(f.kickoff_utc).getTime() > Date.now()
  );

  // Swap to the locked view the moment kickoff arrives while sitting on this tab.
  useEffect(() => {
    if (lockTime === null || Date.now() >= lockTime) return;
    const id = setTimeout(() => forceTick((t) => t + 1), lockTime - Date.now() + 500);
    return () => clearTimeout(id);
  }, [lockTime]);

  // Wait for fixtures too (so `locked` is known) before the first paint — otherwise
  // a locked latecomer flashes the formation picker until fixtures load. Skipped
  // when a local build is already in progress (formationCode set) for an instant paint.
  if ((restoring || resolving || fixtures === null) && formationCode === null) {
    return (
      <Screen glow="pitch" edges={['bottom']}>
        <View className="gap-md px-xl py-xl">
          <Skeleton width="50%" height={22} />
          <Skeleton width="100%" height={420} radius={20} />
        </View>
      </Screen>
    );
  }

  // After kickoff, wait until we know whether a team is already on record before
  // deciding between the locked view and a late build (avoids a wrong-state flash).
  if (firstKickoffPassed && hasSaved === null) {
    return (
      <Screen glow="pitch" edges={['bottom']}>
        <View className="gap-md px-xl py-xl">
          <Skeleton width="50%" height={22} />
          <Skeleton width="100%" height={420} radius={20} />
        </View>
      </Screen>
    );
  }

  // A team already on record once the day has started is read-only — show the live XI
  // (the same view league members see).
  if (locked) {
    return <LiveRosterView gameDay={buildDay} />;
  }

  // Missed the deadline and nothing left to pick → the "too late" state.
  if (lateBuild && !anyTeamOpen) {
    return <LatecomerState buildDay={buildDay} lockTime={lockTime} />;
  }

  return formationCode ? (
    <PitchView
      formationCode={formationCode}
      buildDay={buildDay}
      fixtures={fixtures}
      lateBuild={lateBuild}
      onSaved={() => setHasSaved(true)}
    />
  ) : (
    <FormationPicker />
  );
}
