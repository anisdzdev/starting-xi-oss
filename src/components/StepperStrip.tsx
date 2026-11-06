import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { spacing, useThemeColors } from '@/theme';

type Props = {
  label: string;
  /** Small muted line under the label (e.g. the day's matchday). */
  subtitle?: string | null;
  /** Null disables the arrow. */
  onOlder: (() => void) | null;
  onNewer: (() => void) | null;
};

/**
 * A centered label with prev/next chevron arrows — the shared chrome of the
 * day selector (`DayStrip`) and the round selector (`RoundStrip`). Left always
 * means "back in time", right "forward"; a null handler disables its arrow.
 */
export function StepperStrip({ label, subtitle, onOlder, onNewer }: Props) {
  return (
    <View
      className="flex-row items-center justify-between border-b border-border px-xl"
      style={{ paddingVertical: spacing.md }}
    >
      <ArrowButton icon={ChevronLeft} disabled={!onOlder} onPress={onOlder ?? undefined} />
      <View className="items-center">
        <Text className="text-lg font-bold text-text">{label}</Text>
        {subtitle ? <Text className="text-xs text-textMuted">{subtitle}</Text> : null}
      </View>
      <ArrowButton icon={ChevronRight} disabled={!onNewer} onPress={onNewer ?? undefined} />
    </View>
  );
}

function ArrowButton({
  icon: Icon,
  disabled,
  onPress,
}: {
  icon: typeof ChevronLeft;
  disabled: boolean;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className="h-[40px] w-[40px] items-center justify-center rounded-full border active:opacity-70"
      style={{
        borderColor: c.border,
        backgroundColor: c.surface,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon size={22} color={disabled ? c.textFaint : c.text} strokeWidth={2.2} />
    </Pressable>
  );
}
