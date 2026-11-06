import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** Lucide icon shown in a soft circle when no custom illustration is given. */
  icon?: LucideIcon;
  /** Custom illustration slot — replaces the icon circle entirely. */
  illustration?: ReactNode;
  title: string;
  message?: string;
  /** Action slot (e.g. a <Button />). */
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, illustration, title, message, action }: Props) {
  const c = useThemeColors();
  return (
    <View className="items-center gap-md px-xl py-3xl">
      {illustration ??
        (Icon ? (
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full border border-border bg-surface">
            <Icon size={30} color={c.textMuted} strokeWidth={1.6} />
          </View>
        ) : null)}
      <Text className="text-center text-lg font-semibold text-text">{title}</Text>
      {message ? (
        <Text className="max-w-[280px] text-center text-sm text-textMuted">{message}</Text>
      ) : null}
      {action ? <View className="pt-sm">{action}</View> : null}
    </View>
  );
}
