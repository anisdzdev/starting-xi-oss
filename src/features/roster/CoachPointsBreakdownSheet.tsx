import { Text, View } from 'react-native';

import { BottomSheet } from '@/components';
import { colors, spacing } from '@/theme';
import type { CoachBreakdown } from './useCoachPick';

const LINES: { key: keyof CoachBreakdown; label: string }[] = [
  { key: 'subGoals', label: 'Sub goals (3 each)' },
  { key: 'subAssists', label: 'Sub assists (2 each)' },
  { key: 'motm', label: 'Sub Man of the Match (3)' },
  { key: 'result', label: 'Match result (win +5 / draw 0 / loss −3)' },
  { key: 'cards', label: 'Coach cards (yellow −1 / red −3)' },
];

export function CoachPointsBreakdownSheet({
  visible,
  onClose,
  breakdown,
  total,
}: {
  visible: boolean;
  onClose: () => void;
  breakdown: CoachBreakdown | null;
  total: number | null;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="text-lg font-semibold text-text" style={{ marginBottom: spacing.md }}>
        Coach points
      </Text>
      <View style={{ gap: spacing.sm }}>
        {LINES.map((l) => {
          const v = breakdown?.[l.key] ?? 0;
          return (
            <View
              key={l.key}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text style={{ color: colors.textMuted, flex: 1 }}>{l.label}</Text>
              <Text style={{ color: v < 0 ? colors.danger : colors.text, fontWeight: '600' }}>
                {v > 0 ? `+${v}` : v}
              </Text>
            </View>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Total</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{total ?? 0}</Text>
        </View>
      </View>
    </BottomSheet>
  );
}
