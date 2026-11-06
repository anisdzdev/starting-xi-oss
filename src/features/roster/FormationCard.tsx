import { Pressable, Text } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { useThemeColors } from '@/theme';

import { slotLayout, type Formation } from './formations';

/** Mini pitch diagram: one dot per slot, GK at the bottom. */
export function FormationDiagram({
  code,
  width = 64,
  height = 84,
  selected = false,
}: {
  code: string;
  width?: number;
  height?: number;
  selected?: boolean;
}) {
  const c = useThemeColors();
  const dot = selected ? c.primary : c.textMuted;
  return (
    <Svg width={width} height={height} viewBox="0 0 100 130">
      <Rect
        x="6"
        y="6"
        width="88"
        height="118"
        rx="6"
        stroke={selected ? c.primary : c.border}
        strokeOpacity={selected ? 0.5 : 0.8}
        strokeWidth="3"
        fill={selected ? `${c.primary}10` : 'transparent'}
      />
      {slotLayout(code).map((p) => (
        <Circle
          key={p.slot}
          cx={6 + (p.x / 100) * 88}
          cy={6 + ((p.y + 4) / 100) * 110}
          r="5.5"
          fill={p.position === 'GK' ? c.accentGold : dot}
        />
      ))}
    </Svg>
  );
}

export function FormationCard({
  formation,
  selected,
  onPress,
}: {
  formation: Formation;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`items-center gap-sm rounded-xl border p-md active:opacity-75 ${
        selected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
      }`}
    >
      <FormationDiagram code={formation.code} selected={selected} />
      <Text
        className={`text-sm font-bold ${selected ? 'text-primary' : 'text-text'}`}
      >
        {formation.code}
      </Text>
    </Pressable>
  );
}
