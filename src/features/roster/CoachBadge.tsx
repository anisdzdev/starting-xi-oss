import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';

import { Card, FlagBadge } from '@/components';
import { colors } from '@/theme';
import { CoachPointsBreakdownSheet } from './CoachPointsBreakdownSheet';
import type { CoachBreakdown, CoachPickCoach } from './useCoachPick';

/** Compact coach chip for the locked roster / team top bar — coach photo, country
 *  flag BESIDE it (never overlapping the face), surname (truncates), and points
 *  with a "pts" label (tap → breakdown). Presentational: the parent owns the data
 *  so the coach's points can also fold into the headline total. */
export function CoachBadge({
  pick,
  points,
  breakdown,
}: {
  pick: CoachPickCoach | null;
  points: number | null;
  breakdown: CoachBreakdown | null;
}) {
  const [open, setOpen] = useState(false);
  if (!pick) return null;

  const surname = pick.name.split(' ').slice(-1)[0] || pick.name;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Coach ${pick.name}, ${points ?? 0} points`}
        style={{ flexShrink: 1 }}
      >
        <Card variant="glass" className="flex-row items-center gap-xs px-sm py-xs" style={{ flexShrink: 1 }}>
          {pick.image_url ? (
            <Image source={{ uri: pick.image_url }} style={{ width: 26, height: 26, borderRadius: 13 }} />
          ) : (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={14} color={colors.textMuted} />
            </View>
          )}
          <FlagBadge uri={pick.team.flag_url} code={pick.team.code} variant="round" size={16} />
          <Text
            className="text-sm font-semibold text-text"
            numberOfLines={1}
            style={{ flexShrink: 1, marginLeft: 2 }}
          >
            {surname}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{points ?? 0}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 2 }}>pts</Text>
          </View>
        </Card>
      </Pressable>
      <CoachPointsBreakdownSheet
        visible={open}
        onClose={() => setOpen(false)}
        breakdown={breakdown}
        total={points}
      />
    </>
  );
}
