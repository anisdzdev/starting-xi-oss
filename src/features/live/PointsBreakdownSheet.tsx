import { Crown } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { BottomSheet, Card, ScoringInfoButton } from '@/components';
import { POINTS, type Position } from '@/shared/scoring';
import { useThemeColors } from '@/theme';

import type { DbStats, LiveRosterPlayer } from './useLiveRoster';

type Row = { label: string; detail: string; pts: number };

/** Per-line points from a stats row, mirroring src/shared/scoring.ts. */
export function breakdownRows(position: Position, s: DbStats): Row[] {
  const rows: Row[] = [];
  if (s.minutes > 0) {
    rows.push({
      label: 'Minutes played',
      detail: `${s.minutes}'`,
      pts: s.minutes >= 60 ? POINTS.appearance60 : POINTS.appearance,
    });
  }
  if (s.goals > 0) {
    rows.push({ label: 'Goals', detail: `×${s.goals}`, pts: s.goals * POINTS.goal[position] });
  }
  if (s.assists > 0) {
    rows.push({ label: 'Assists', detail: `×${s.assists}`, pts: s.assists * POINTS.assist });
  }
  if (s.clean_sheet && s.minutes >= 60 && POINTS.cleanSheet[position] > 0) {
    rows.push({ label: 'Clean sheet', detail: '', pts: POINTS.cleanSheet[position] });
  }
  if (position === 'GK' && Math.floor(s.saves / 3) > 0) {
    rows.push({
      label: 'Saves',
      detail: `×${s.saves}`,
      pts: Math.floor(s.saves / 3) * POINTS.per3Saves,
    });
  }
  if (s.pen_saves > 0) {
    rows.push({ label: 'Penalty saves', detail: `×${s.pen_saves}`, pts: s.pen_saves * POINTS.penSave });
  }
  if (s.pen_misses > 0) {
    rows.push({ label: 'Penalty misses', detail: `×${s.pen_misses}`, pts: s.pen_misses * POINTS.penMiss });
  }
  if (s.yellows > 0) {
    rows.push({ label: 'Yellow cards', detail: `×${s.yellows}`, pts: s.yellows * POINTS.yellow });
  }
  if (s.reds > 0) {
    rows.push({ label: 'Red card', detail: '', pts: s.reds * POINTS.red });
  }
  if (s.own_goals > 0) {
    rows.push({ label: 'Own goals', detail: `×${s.own_goals}`, pts: s.own_goals * POINTS.ownGoal });
  }
  if ((position === 'GK' || position === 'DEF') && Math.floor(s.goals_conceded / 2) > 0) {
    rows.push({
      label: 'Goals conceded',
      detail: `×${s.goals_conceded}`,
      pts: Math.floor(s.goals_conceded / 2) * POINTS.per2Conceded,
    });
  }
  if (s.bonus > 0) {
    rows.push({
      label: 'Bonus',
      detail: s.rating != null ? `rating ${s.rating}` : '',
      pts: s.bonus,
    });
  }
  return rows;
}

type Props = {
  player: LiveRosterPlayer | null;
  stats: DbStats | null;
  /** Player's match already finished (distinguishes DNP from not-yet-started). */
  matchFinished?: boolean;
  onClose: () => void;
};

export function PointsBreakdownSheet({ player, stats, matchFinished = false, onClose }: Props) {
  const c = useThemeColors();
  const rows = player && stats ? breakdownRows(player.position, stats) : [];
  const base = stats?.fpl_points ?? 0;
  const total = player?.isCaptain ? base * 2 : base;

  return (
    <BottomSheet visible={player !== null} onClose={onClose}>
      {player ? (
        <View className="gap-md pb-lg">
          <View className="flex-row items-center gap-sm">
            <Text className="text-lg font-semibold text-text">{player.name}</Text>
            {player.isCaptain ? <Crown size={16} color={c.captain} strokeWidth={2.2} /> : null}
            <Text className="text-sm text-textMuted">
              {player.position} · {player.teamCode}
            </Text>
          </View>

          {stats === null || rows.length === 0 ? (
            <Card variant="glass">
              <Text className="text-sm text-textMuted">
                {matchFinished
                  ? 'Did not play — 0 points. An unused sub scores nothing.'
                  : 'No stats yet — points appear once the match kicks off.'}
              </Text>
            </Card>
          ) : (
            <Card variant="glass" className="gap-sm">
              {rows.map((r) => (
                <View key={r.label} className="flex-row items-center justify-between">
                  <Text className="text-sm text-textMuted">
                    {r.label}
                    {r.detail ? <Text className="text-textFaint">  {r.detail}</Text> : null}
                  </Text>
                  <Text
                    className="text-sm font-bold"
                    style={{ color: r.pts >= 0 ? c.text : c.danger }}
                  >
                    {r.pts > 0 ? `+${r.pts}` : r.pts}
                  </Text>
                </View>
              ))}
              {player.isCaptain ? (
                <View className="flex-row items-center justify-between border-t border-border pt-sm">
                  <View className="flex-row items-center gap-xs">
                    <Crown size={13} color={c.captain} strokeWidth={2.2} />
                    <Text className="text-sm font-medium text-textMuted">Captain ×2</Text>
                  </View>
                  <Text className="text-sm font-bold" style={{ color: c.captain }}>
                    {base} → {total}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-center justify-between border-t border-border pt-sm">
                <Text className="text-base font-semibold text-text">Total</Text>
                <Text className="text-base font-bold text-primary">{total}</Text>
              </View>
            </Card>
          )}

          <ScoringInfoButton variant="link" />
        </View>
      ) : null}
    </BottomSheet>
  );
}
