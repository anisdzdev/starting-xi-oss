import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** Diameter of the player photo bubble these icons overlay. */
  size: number;
  goals?: number;
  assists?: number;
  cleanSheet?: boolean;
  isMotm?: boolean;
};

/**
 * FotMob-style stat markers overlaid on a player photo bubble: a green MVP star
 * at the top-right, and a bottom-edge row of goal (ball), assist (boot) and
 * clean-sheet (shield) badges. Glyphs come from @expo/vector-icons'
 * MaterialCommunityIcons (soccer / shoe-cleat / shield / star). Must live inside
 * a NON-clipped relative wrapper sized to the bubble (the photo circle itself
 * clips its image, this sits above it).
 */
export function PlayerFieldIcons({ size, goals = 0, assists = 0, cleanSheet, isMotm }: Props) {
  const c = useThemeColors();
  const badge = Math.round(size * 0.42);
  const glyph = Math.round(badge * 0.68);
  const hasRow = goals > 0 || assists > 0 || cleanSheet;

  if (!hasRow && !isMotm) return null;

  const chip = {
    height: badge,
    minWidth: badge,
    borderRadius: badge / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(8,11,18,0.94)',
    paddingHorizontal: 2,
    gap: 1,
  };

  return (
    <>
      {isMotm ? (
        <View
          style={{
            position: 'absolute',
            top: -badge * 0.26,
            right: -badge * 0.26,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(8,11,18,0.94)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.30)',
          }}
        >
          <MaterialCommunityIcons name="star" size={glyph + 1} color={c.primary} />
        </View>
      ) : null}

      {hasRow ? (
        <View
          style={{
            position: 'absolute',
            bottom: -badge * 0.4,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 3,
          }}
        >
          {goals > 0 ? (
            <View style={chip}>
              <MaterialCommunityIcons name="soccer" size={glyph} color="#FFFFFF" />
              {goals > 1 ? <Count value={goals} glyph={glyph} /> : null}
            </View>
          ) : null}
          {assists > 0 ? (
            <View style={chip}>
              <MaterialCommunityIcons name="shoe-cleat" size={glyph} color="#FFFFFF" />
              {assists > 1 ? <Count value={assists} glyph={glyph} /> : null}
            </View>
          ) : null}
          {cleanSheet ? (
            <View style={chip}>
              <MaterialCommunityIcons name="shield" size={glyph} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function Count({ value, glyph }: { value: number; glyph: number }) {
  return (
    <Text style={{ color: '#FFFFFF', fontSize: glyph * 0.72, fontWeight: '800' }}>{value}</Text>
  );
}
