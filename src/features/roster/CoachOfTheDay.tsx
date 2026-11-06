import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, User } from 'lucide-react-native';

import { Card, FlagBadge } from '@/components';
import { colors, spacing } from '@/theme';
import { CoachPicker } from './CoachPicker';
import { CoachPointsBreakdownSheet } from './CoachPointsBreakdownSheet';
import { loadPickableCoaches, saveCoachPick, useCoachPick } from './useCoachPick';
import { validateCoachPick, type PickableCoach } from './validateCoachPick';

/** Coach of the Day — the daily manager pick, folded into the roster builder.
 *  Pre-lock: editable picker. Late build (missed kickoff, no pick yet): picker
 *  limited to teams that haven't started, locks on save. Locked: read-only card
 *  with live points + a breakdown sheet. */
export function CoachOfTheDay({
  gameDay,
  firstKickoffPassed,
  playingTeams,
  startedTeamCodes,
}: {
  gameDay: string;
  firstKickoffPassed: boolean;
  playingTeams: { id: number; code: string; flag_url: string | null }[];
  startedTeamCodes: Set<string>;
}) {
  const { pick, hasPick, points, breakdown, loading, refresh } = useCoachPick(gameDay);
  const [coaches, setCoaches] = useState<PickableCoach[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(playingTeams.map((t) => [t.id, t])), [playingTeams]);

  useEffect(() => {
    let alive = true;
    loadPickableCoaches(playingTeams.map((t) => t.id)).then((rows) => {
      if (!alive) return;
      setCoaches(
        rows.map((r) => {
          const team = teamById.get(r.team_id);
          return {
            id: r.id,
            name: r.name,
            teamId: r.team_id,
            imageUrl: r.image_url,
            teamCode: team?.code ?? '',
            flagUrl: team?.flag_url ?? null,
          };
        })
      );
    });
    return () => {
      alive = false;
    };
  }, [playingTeams, teamById]);

  const locked = firstKickoffPassed && hasPick;
  const lateBuild = firstKickoffPassed && !hasPick;

  // Late build: only coaches whose team hasn't kicked off are pickable — mirror the
  // roster's eligible-teams picker rather than showing a wall of greyed entries.
  const pickerCoaches = useMemo(
    () => (lateBuild ? coaches.filter((c) => !startedTeamCodes.has(c.teamCode)) : coaches),
    [coaches, lateBuild, startedTeamCodes]
  );

  async function choose(c: PickableCoach) {
    const err = validateCoachPick(c, lateBuild ? startedTeamCodes : new Set<string>());
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setPickerOpen(false);
    try {
      await saveCoachPick(gameDay, c.id, c.teamId, lateBuild);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save coach.');
    }
  }

  // Avoid a wrong-state flash after kickoff until we know whether a pick exists.
  if (loading && firstKickoffPassed) return null;

  const photo = (uri: string | null, size: number) =>
    uri ? (
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    ) : (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <User size={size * 0.5} color={colors.textMuted} />
      </View>
    );

  return (
    <Card className="mx-xl mb-sm" style={{ gap: spacing.sm }}>
      <Text className="text-xs font-semibold uppercase tracking-widest text-textFaint">
        Coach of the day
      </Text>

      {pick ? (
        <Pressable
          onPress={() => (locked ? setSheetOpen(true) : setPickerOpen(true))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          {photo(pick.image_url, 44)}
          <View style={{ flex: 1 }}>
            <Text className="text-base font-semibold text-text" numberOfLines={1}>
              {pick.name}
            </Text>
            <Text className="text-xs text-textMuted">{pick.team.code}</Text>
          </View>
          {locked ? (
            <Text style={{ color: colors.text, fontWeight: '700' }}>{points ?? 0} pts</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <FlagBadge uri={pick.team.flag_url} code={pick.team.code} variant="round" size={28} />
              <ChevronDown size={18} color={colors.textMuted} strokeWidth={2.4} />
            </View>
          )}
        </Pressable>
      ) : firstKickoffPassed && !lateBuild ? (
        <Text className="text-sm text-textMuted">No coach picked.</Text>
      ) : (
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.xs,
          }}
        >
          {photo(null, 44)}
          <Text style={{ color: colors.primary, fontWeight: '700', flex: 1 }}>
            {lateBuild ? 'Pick a coach (teams not started)' : 'Pick your coach'}
          </Text>
          <ChevronDown size={18} color={colors.textMuted} strokeWidth={2.4} />
        </Pressable>
      )}

      {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}

      <CoachPicker
        visible={pickerOpen}
        coaches={pickerCoaches}
        startedTeamCodes={lateBuild ? startedTeamCodes : new Set<string>()}
        onSelect={choose}
        onClose={() => setPickerOpen(false)}
      />
      <CoachPointsBreakdownSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        breakdown={breakdown}
        total={points}
      />
    </Card>
  );
}
