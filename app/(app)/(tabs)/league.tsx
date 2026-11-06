import { router } from 'expo-router';
import { Bell, BellRing, CircleDashed, ClipboardList, Lock, ShieldCheck, ShieldOff, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  Avatar,
  EmptyState,
  FlagBadge,
  Screen,
  Skeleton,
  useThemedRefreshControl,
} from '@/components';
import { useSession } from '@/features/auth/session-context';
import { grantException, revokeException } from '@/features/league/exceptions';
import { sendNudge, useMyNudgesToday } from '@/features/league/nudges';
import { useGameDay } from '@/features/live/useGameDay';
import { CoachLine } from '@/features/roster/coachLine';
import { useActiveSeason } from '@/features/seasons';
import {
  useLeagueMembers,
  type LeagueMember,
  type MemberStatus,
} from '@/features/league/useLeagueMembers';
import { useThemeColors } from '@/theme';

function StatusChip({ status, pickedCount }: { status: MemberStatus; pickedCount: number }) {
  const c = useThemeColors();
  const cfg =
    status === 'locked'
      ? { Icon: Lock, label: 'Locked', color: c.captain }
      : status === 'building'
        ? { Icon: ClipboardList, label: `${pickedCount}/11`, color: c.accentCyan }
        : { Icon: CircleDashed, label: 'Not started', color: c.textFaint };
  return (
    <View className="flex-row items-center gap-xs rounded-full border border-border bg-surface px-sm py-[2px]">
      <cfg.Icon size={12} color={cfg.color} strokeWidth={2.2} />
      <Text className="text-xs font-semibold" style={{ color: cfg.color }}>
        {cfg.label}
      </Text>
    </View>
  );
}

function PicksRow({ member }: { member: LeagueMember }) {
  const p = member.picks;
  // No picks side-game this season (e.g. the Champions League) → nothing to show.
  const season = useActiveSeason();
  if (!season?.hasTournamentPicks) return null;
  if (!p) {
    return <Text className="text-xs text-textFaint">No tournament picks yet</Text>;
  }
  return (
    <View className="flex-row items-center justify-center gap-md">
      <FlagBadge uri={p.teamFlag} code={p.teamCode ?? undefined} size={24} />
      <Avatar uri={p.playerImage} name={p.playerName ?? undefined} size={24} />
      <Avatar uri={p.keeperImage} name={p.keeperName ?? undefined} size={24} ring="primary" />
    </View>
  );
}

function NudgeButton({
  member,
  alreadyNudged,
  onNudged,
}: {
  member: LeagueMember;
  alreadyNudged: boolean;
  onNudged: (id: string) => void;
}) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);
  const done = alreadyNudged;

  return (
    <Pressable
      disabled={done || busy}
      onPress={async (e) => {
        setBusy(true);
        const result = await sendNudge(member.id);
        setBusy(false);
        if (result === 'sent' || result === 'already') onNudged(member.id);
      }}
      className={`flex-row items-center gap-xs rounded-full border px-md py-xs ${
        done ? 'border-border bg-surface opacity-60' : 'border-primary bg-primary/15 active:opacity-70'
      }`}
    >
      {done ? (
        <BellRing size={13} color={c.textMuted} strokeWidth={2.2} />
      ) : (
        <Bell size={13} color={c.primary} strokeWidth={2.2} />
      )}
      <Text
        className="text-xs font-semibold"
        style={{ color: done ? c.textMuted : c.primary }}
      >
        {busy ? 'Nudging…' : done ? 'Nudged' : 'Nudge'}
      </Text>
    </Pressable>
  );
}

function ExceptionToggle({
  member,
  gameDay,
  onChanged,
}: {
  member: LeagueMember;
  gameDay: string;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);
  const granted = member.hasException;
  return (
    <Pressable
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          if (granted) await revokeException(member.id, gameDay);
          else await grantException(member.id, gameDay);
          onChanged();
        } catch {
          onChanged();
        } finally {
          setBusy(false);
        }
      }}
      className={`flex-row items-center gap-xs rounded-full border px-md py-xs ${
        granted
          ? 'border-captain bg-captain/15 active:opacity-70'
          : 'border-border bg-surface active:opacity-70'
      }`}
    >
      {granted ? (
        <ShieldCheck size={13} color={c.captain} strokeWidth={2.2} />
      ) : (
        <ShieldOff size={13} color={c.textMuted} strokeWidth={2.2} />
      )}
      <Text
        className="text-xs font-semibold"
        style={{ color: granted ? c.captain : c.textMuted }}
      >
        {busy ? 'Saving…' : granted ? 'Exception on' : 'Grant exception'}
      </Text>
    </Pressable>
  );
}

function MemberCard({
  member,
  canNudge,
  alreadyNudged,
  onNudged,
  canGrantException,
  gameDay,
  onExceptionChanged,
}: {
  member: LeagueMember;
  canNudge: boolean;
  alreadyNudged: boolean;
  onNudged: (id: string) => void;
  canGrantException: boolean;
  gameDay: string;
  onExceptionChanged: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={() => router.push(`/team/${member.id}`)}
      className="m-sm flex-1 items-center gap-sm rounded-xl border border-borderGlass bg-surfaceGlass p-lg active:opacity-80"
    >
      <Avatar uri={member.avatarUrl} name={member.name} size={56} />
      <Text className="text-base font-semibold text-text" numberOfLines={1}>
        {member.name}
      </Text>
      <StatusChip status={member.status} pickedCount={member.pickedCount} />
      {canNudge ? (
        <NudgeButton member={member} alreadyNudged={alreadyNudged} onNudged={onNudged} />
      ) : null}
      {canGrantException ? (
        <ExceptionToggle member={member} gameDay={gameDay} onChanged={onExceptionChanged} />
      ) : null}
      {member.status === 'locked' ? (
        <View className="flex-row items-end gap-xs">
          <Text className="text-2xl font-bold" style={{ color: c.primary }}>
            {member.points ?? 0}
          </Text>
          <Text className="pb-[3px] text-xs text-textMuted">pts</Text>
        </View>
      ) : null}
      <PicksRow member={member} />
      <CoachLine gameDay={gameDay} userId={member.id} compact />
    </Pressable>
  );
}

export default function LeagueScreen() {
  const { members, loading, locked, refreshing, pullToRefresh, refetch } = useLeagueMembers();
  const { session, profile } = useSession();
  const { gameDay } = useGameDay();
  const { nudged, markNudged } = useMyNudgesToday();
  const myId = session?.user.id;
  const isSuperuser = profile?.is_superuser ?? false;
  const refreshControl = useThemedRefreshControl(refreshing, pullToRefresh);

  return (
    <Screen glow="hype" edges={['top']}>
      <View className="px-xl pb-md pt-xl">
        <Text className="text-2xl font-bold text-text">The League</Text>
      </View>
      {loading ? (
        <View className="flex-row gap-md px-xl">
          <Skeleton width="47%" height={190} radius={20} />
          <Skeleton width="47%" height={190} radius={20} />
        </View>
      ) : members === null || members.length === 0 ? (
        <EmptyState icon={Users} title="Nobody here yet" message="Invite your friends." />
      ) : (
        // Plain flex-wrap grid, NOT a `numColumns` FlatList: layout-entering
        // animations on a multi-column FlatList cell detach the cell from flow
        // during the entrance and overlap the next row (see WEB GOTCHA #3). Here
        // each card is a normal-flow flex child, so the `entering` transform never
        // affects layout. Stable `key`s mean the entrance plays once on mount and
        // does NOT replay when the realtime refetch swaps in fresh data. The
        // league is a small friends list, so we don't need FlatList virtualization.
        <ScrollView contentContainerClassName="flex-row flex-wrap px-md pb-xl" refreshControl={refreshControl}>
          {members.map((item, index) => {
            const card = (
              <MemberCard
                member={item}
                canNudge={!locked && item.id !== myId && item.pickedCount < 11}
                alreadyNudged={nudged.has(item.id)}
                onNudged={markNudged}
                canGrantException={isSuperuser && item.id !== myId}
                gameDay={gameDay ?? ''}
                onExceptionChanged={refetch}
              />
            );
            // entering animations render blank inside FlatList on web; in this
            // plain container they're fine on native, but we keep web plain to
            // match the rest of the app's web-render-plain posture.
            if (Platform.OS === 'web') {
              return (
                <View key={item.id} style={{ width: '50%' }}>
                  {card}
                </View>
              );
            }
            return (
              <Animated.View
                key={item.id}
                entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 60)}
                style={{ width: '50%' }}
              >
                {card}
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}
