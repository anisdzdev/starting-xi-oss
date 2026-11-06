import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** Image URL; falls back to initials when missing. */
  uri?: string | null;
  name?: string;
  size?: number;
  /** Status ring: captain = gold, live = red, primary = pitch green. */
  ring?: 'none' | 'captain' | 'live' | 'primary';
};

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ uri, name, size = 40, ring = 'none' }: Props) {
  const c = useThemeColors();
  const ringColor =
    ring === 'captain' ? c.captain : ring === 'live' ? c.live : ring === 'primary' ? c.primary : null;

  const inner = uri ? (
    <Image
      source={uri}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={150}
    />
  ) : (
    <View
      className="items-center justify-center bg-surfaceRaised"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="font-semibold text-textMuted" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );

  if (!ringColor) return inner;
  return (
    <View
      style={{
        padding: 2,
        borderRadius: (size + 8) / 2,
        borderWidth: 2,
        borderColor: ringColor,
      }}
    >
      {inner}
    </View>
  );
}
