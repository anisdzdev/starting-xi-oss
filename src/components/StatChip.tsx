import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Tone = 'default' | 'success' | 'danger' | 'accent' | 'gold' | 'live';

type Props = {
  label: string;
  value?: string | number;
  icon?: LucideIcon;
  tone?: Tone;
};

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-textMuted',
  success: 'text-success',
  danger: 'text-danger',
  accent: 'text-accentCyan',
  gold: 'text-accentGold',
  live: 'text-live',
};

export function StatChip({ label, value, icon: Icon, tone = 'default' }: Props) {
  const c = useThemeColors();
  const iconColor =
    tone === 'success'
      ? c.success
      : tone === 'danger'
        ? c.danger
        : tone === 'accent'
          ? c.accentCyan
          : tone === 'gold'
            ? c.accentGold
            : tone === 'live'
              ? c.live
              : c.textMuted;

  return (
    <View className="flex-row items-center gap-xs self-start rounded-full border border-border bg-surface px-md py-xs">
      {Icon ? <Icon size={14} color={iconColor} strokeWidth={2.2} /> : null}
      <Text className={`text-xs font-medium ${TONE_TEXT[tone]}`}>{label}</Text>
      {value !== undefined ? (
        <Text className="text-xs font-bold text-text">{value}</Text>
      ) : null}
    </View>
  );
}
