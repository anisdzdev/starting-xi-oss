import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

type Props = ViewProps & {
  children: ReactNode;
  /** glass = translucent with hairline border; elevated = solid raised surface with shadow. */
  variant?: 'glass' | 'elevated';
};

export function Card({ children, variant = 'glass', className, ...rest }: Props) {
  const base = 'rounded-xl p-lg';
  const look =
    variant === 'glass'
      ? 'bg-surfaceGlass border border-borderGlass'
      : 'bg-surfaceRaised border border-border shadow-lg shadow-black/40';
  return (
    <View className={`${base} ${look} ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
}
