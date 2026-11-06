import { Archive, Check, ChevronDown, Clock, Radio } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components';
import { useThemeColors } from '@/theme';

import type { Season } from './types';

type Props = {
  value: Season;
  seasons: Season[];
  onChange: (season: Season) => void;
};

const STATUS_LABEL: Record<Season['status'], string> = {
  active: 'Live',
  archived: 'Archived',
  upcoming: 'Upcoming',
};

/**
 * Season switcher: a compact chip (short name + chevron) that opens a bottom
 * sheet listing every season with its status. Used on the Standings header so
 * archived seasons (the World Cup) stay browsable.
 */
export function SeasonPicker({ value, seasons, onChange }: Props) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="flex-row items-center gap-xs rounded-full border border-border bg-surface px-md py-xs active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={`Season: ${value.name}. Change season`}
      >
        <Text className="text-sm font-semibold text-text">{value.shortName}</Text>
        <ChevronDown size={14} color={c.textMuted} strokeWidth={2.4} />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View className="gap-md px-xl pb-xl pt-md">
          <Text className="text-lg font-bold text-text">Season</Text>
          {seasons.map((s) => {
            const selected = s.id === value.id;
            const Icon = s.status === 'active' ? Radio : s.status === 'archived' ? Archive : Clock;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className="flex-row items-center gap-md rounded-xl border px-md py-md active:opacity-80"
                // state-driven border/background must be explicit style (className swaps are unreliable on web)
                style={{
                  borderColor: selected ? c.primary : c.border,
                  backgroundColor: selected ? c.surfaceRaised : c.surface,
                }}
              >
                <Icon
                  size={18}
                  color={s.status === 'active' ? c.live : c.textMuted}
                  strokeWidth={2.2}
                />
                <View className="flex-1">
                  <Text className="text-base font-semibold text-text">{s.name}</Text>
                  <Text className="text-xs text-textMuted">{STATUS_LABEL[s.status]}</Text>
                </View>
                {selected ? <Check size={18} color={c.primary} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}
