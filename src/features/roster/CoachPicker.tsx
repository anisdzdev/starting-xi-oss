import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';

import { BottomSheet, FlagBadge } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { PickableCoach } from './validateCoachPick';

export function CoachPicker({
  visible,
  coaches,
  startedTeamCodes,
  onSelect,
  onClose,
}: {
  visible: boolean;
  coaches: PickableCoach[];
  startedTeamCodes: Set<string>;
  onSelect: (c: PickableCoach) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () =>
      coaches
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [coaches, q]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="text-lg font-semibold text-text" style={{ marginBottom: spacing.md }}>
        Pick a coach
      </Text>
      <TextInput
        placeholder="Search coaches"
        placeholderTextColor={colors.textMuted}
        value={q}
        onChangeText={setQ}
        style={{
          color: colors.text,
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.md,
        }}
      />
      <View style={{ gap: spacing.sm }}>
        {filtered.map((c) => {
          const started = startedTeamCodes.has(c.teamCode);
          return (
            <Pressable
              key={c.id}
              disabled={started}
              onPress={() => onSelect(c)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                opacity: started ? 0.4 : 1,
              }}
            >
              {c.imageUrl ? (
                <Image
                  source={{ uri: c.imageUrl }}
                  style={{ width: 40, height: 40, borderRadius: 20 }}
                />
              ) : (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={20} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text className="text-base font-semibold text-text" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text className="text-xs text-textMuted">
                  {c.teamCode}
                  {started ? ' · kicked off' : ''}
                </Text>
              </View>
              <FlagBadge uri={c.flagUrl} code={c.teamCode} variant="round" size={28} />
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text className="text-sm text-textMuted" style={{ paddingVertical: spacing.md }}>
            No coaches available.
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
