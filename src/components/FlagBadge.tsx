import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { radii, useThemeColors } from '@/theme';

type Props = {
  /** Flag/crest image (teams.flag_url — FotMob team logo CDN). */
  uri?: string | null;
  /** 3-letter code fallback when the image is missing. */
  code?: string;
  size?: number;
  /**
   * round = FotMob-style fully circular badge with hairline ring;
   * crest = FIFA-style rounded-square badge with a thicker border.
   */
  variant?: 'round' | 'crest';
  /** Red pulse ring for teams currently playing. */
  live?: boolean;
};

export function FlagBadge({ uri, code, size = 40, variant = 'round', live = false }: Props) {
  const c = useThemeColors();
  const round = variant === 'round';
  const outerRadius = round ? size : radii.md + 2;
  const innerRadius = round ? size : radii.md;

  return (
    <View
      style={{
        width: size + 6,
        height: size + 6,
        borderRadius: outerRadius,
        borderWidth: live ? 2 : 1.5,
        borderColor: live ? c.live : round ? c.borderGlass : c.border,
        backgroundColor: c.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
        // crest badges get a subtle "plate" inset look
        padding: round ? 1 : 2,
      }}
    >
      {uri ? (
        <Image
          source={uri}
          style={{ width: size - 2, height: size - 2, borderRadius: innerRadius }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <Text
          className="font-bold text-textMuted"
          style={{ fontSize: Math.max(10, size * 0.28) }}
        >
          {code ?? '?'}
        </Text>
      )}
    </View>
  );
}
