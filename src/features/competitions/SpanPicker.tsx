import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Round } from '@/features/rounds';
import { spacing, useThemeColors } from '@/theme';

import { knockoutSpan, seasonSpan, spanLabel, type Span } from './goal';

type Preset = 'single' | 'range' | 'knockouts' | 'season';

type Props = {
  rounds: Round[];
  value: Span | null;
  onChange: (span: Span | null) => void;
  /** Only rounds whose first day is on/after this day are selectable (not started yet). */
  minStartsOn: string;
};

function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-full border px-md py-xs active:opacity-80"
      // state-driven colours stay in style (className swaps are unreliable on web)
      style={{
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.surfaceRaised : c.surface,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text className="text-sm font-semibold" style={{ color: selected ? c.primary : c.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Which rounds a competition covers: a preset (one matchday / a range / the
 * knockouts / the whole season) plus round chips to pick the matchday(s). The
 * preset is explicit state (not derived from the value) so a range in progress
 * stays in range mode. Rounds that already started are disabled — a competition
 * must start in the future. Rounds are compared by LIST INDEX, never by key
 * string ('md10' < 'md9' lexically).
 */
export function SpanPicker({ rounds, value, onChange, minStartsOn }: Props) {
  const c = useThemeColors();
  const [preset, setPreset] = useState<Preset | null>(null);
  const idx = (key: string) => rounds.findIndex((r) => r.key === key);
  const selectable = rounds.filter((r) => r.startsOn >= minStartsOn);
  const ko = knockoutSpan(rounds);
  const season = seasonSpan(rounds);
  const koOpen = !!ko && rounds[idx(ko.from)].startsOn >= minStartsOn;
  const seasonOpen = !!season && rounds[0].startsOn >= minStartsOn;

  const choose = (p: Preset) => {
    setPreset(p);
    if (p === 'knockouts') return onChange(ko);
    if (p === 'season') return onChange(season);
    // single / range: start from the first selectable round; a range awaits its end
    const first = selectable[0];
    onChange(first ? { from: first.key, to: first.key } : null);
  };

  const pickRound = (key: string) => {
    if (preset === 'range' && value) {
      const i = idx(key);
      const from = idx(value.from);
      // a later round sets the END; an earlier/equal one restarts the range there
      onChange(i > from ? { from: value.from, to: key } : { from: key, to: key });
    } else {
      onChange({ from: key, to: key });
    }
  };

  const inSpan = (key: string) =>
    !!value && idx(key) >= idx(value.from) && idx(key) <= idx(value.to);

  return (
    <View className="gap-md">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="One matchday" selected={preset === 'single'} onPress={() => choose('single')} disabled={selectable.length === 0} />
        <Chip label="Matchday range" selected={preset === 'range'} onPress={() => choose('range')} disabled={selectable.length < 2} />
        <Chip label="Knockouts" selected={preset === 'knockouts'} onPress={() => choose('knockouts')} disabled={!koOpen} />
        <Chip label="Whole season" selected={preset === 'season'} onPress={() => choose('season')} disabled={!seasonOpen} />
      </ScrollView>

      {preset === 'single' || preset === 'range' ? (
        <View className="flex-row flex-wrap gap-sm">
          {rounds.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              selected={inSpan(r.key)}
              disabled={r.startsOn < minStartsOn}
              onPress={() => pickRound(r.key)}
            />
          ))}
        </View>
      ) : null}

      {preset === 'range' ? (
        <Text className="text-xs text-textFaint">
          Tap where the range starts, then tap a later matchday for where it ends.
        </Text>
      ) : null}

      <Text className="text-sm font-semibold" style={{ color: value ? c.text : c.textFaint }}>
        {value ? spanLabel(rounds, value.from, value.to) : 'Pick which matchdays count'}
      </Text>
    </View>
  );
}
