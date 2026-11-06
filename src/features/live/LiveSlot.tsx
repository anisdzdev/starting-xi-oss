import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { POINTS } from '@/shared/scoring';
import { radii, useThemeColors } from '@/theme';

import { PlayerFieldIcons } from './PlayerFieldIcons';
import type { DbStats, LiveRosterPlayer } from './useLiveRoster';

const SLOT_W = 68;
const PHOTO = 44;

type Props = {
  player: LiveRosterPlayer;
  /** Doubled already for the captain. Null = no stats row yet. */
  points: number | null;
  /** Raw stats row for this player (drives the goal/assist/clean-sheet marks). */
  stats: DbStats | null;
  /** Whether this player is the Man of the Match in their fixture. */
  isMotm?: boolean;
  matchStatus: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  kickoffUtc: string | null;
  /** Bumped timestamp when this player's stats change → count-up + flash. */
  flashKey: number | undefined;
  x: number;
  y: number;
  onPress: () => void;
};

/** Steps the displayed number toward the target for a count-up feel. */
function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (displayRef.current === target) return;
    const step = target > displayRef.current ? 1 : -1;
    const id = setInterval(() => {
      setDisplay((d) => {
        const n = d + step;
        if (n === target) clearInterval(id);
        return n;
      });
    }, 110);
    return () => clearInterval(id);
  }, [target]);

  return display;
}

export const LiveSlot = memo(function LiveSlot({
  player,
  points,
  stats,
  isMotm,
  matchStatus,
  kickoffUtc,
  flashKey,
  x,
  y,
  onPress,
}: Props) {
  const c = useThemeColors();
  const flash = useSharedValue(0);
  const displayPoints = useCountUp(points ?? 0);

  // gold highlight pulse whenever the stats row changes
  useEffect(() => {
    if (!flashKey) return;
    flash.set(
      withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) })
      )
    );
  }, [flashKey, flash]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const notStarted = matchStatus === 'scheduled' || matchStatus === 'postponed';
  const finished = matchStatus === 'finished';
  const lastName = player.name.split(' ').slice(-1)[0];

  // Stat marks only make sense once the player is on the pitch.
  const showMarks = matchStatus === 'live' || finished;
  const cleanSheet =
    showMarks &&
    !!stats?.clean_sheet &&
    (stats?.minutes ?? 0) >= 60 &&
    POINTS.cleanSheet[player.position] > 0;
  // A bottom badge row straddles the photo edge — nudge the name pill down.
  const hasRowMarks =
    showMarks && ((stats?.goals ?? 0) > 0 || (stats?.assists ?? 0) > 0 || cleanSheet);

  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: SLOT_W,
        marginLeft: -SLOT_W / 2,
        alignItems: 'center',
      }}
    >
      <View style={{ opacity: finished ? 0.55 : 1, alignItems: 'center' }}>
        {/* bubble box — NOT clipped, so the captain/MVP/stat marks can spill out */}
        <View style={{ width: PHOTO, height: PHOTO }}>
          <View
            style={{
              width: PHOTO,
              height: PHOTO,
              borderRadius: PHOTO / 2,
              borderWidth: 2,
              borderColor: player.isCaptain
                ? c.captain
                : matchStatus === 'live'
                  ? c.live
                  : c.borderGlass,
              backgroundColor: c.surfaceRaised,
              overflow: 'hidden',
              shadowColor: player.isCaptain ? c.captain : 'transparent',
              shadowOpacity: player.isCaptain ? 0.7 : 0,
              shadowRadius: 9,
              shadowOffset: { width: 0, height: 0 },
              elevation: player.isCaptain ? 8 : 0,
            }}
          >
            <Image
              source={player.imageUrl}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={120}
            />
            {/* flash overlay — explicit styles (reanimated) */}
            <Animated.View
              pointerEvents="none"
              style={[
                flashStyle,
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: `${c.captain}66`,
                },
              ]}
            />
          </View>
          {player.isCaptain ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                left: -2,
                backgroundColor: c.captain,
                borderRadius: radii.full,
                width: 16,
                height: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#2B2002' }}>C</Text>
            </View>
          ) : null}

          <PlayerFieldIcons
            size={PHOTO}
            goals={showMarks ? (stats?.goals ?? 0) : 0}
            assists={showMarks ? (stats?.assists ?? 0) : 0}
            cleanSheet={cleanSheet}
            isMotm={showMarks && isMotm}
          />
        </View>

        <View
          className="max-w-[80px] flex-row items-center gap-[3px] rounded-sm bg-overlay px-xs py-[1px]"
          style={{ marginTop: hasRowMarks ? 10 : 4 }}
        >
          {player.flagUrl ? (
            <Image
              source={player.flagUrl}
              style={{ width: 11, height: 11, borderRadius: 6 }}
              contentFit="cover"
              transition={120}
            />
          ) : null}
          <Text numberOfLines={1} className="shrink text-center text-xs font-semibold text-text">
            {lastName}
          </Text>
        </View>

        {/* points / kickoff pill */}
        {notStarted ? (
          <View className="mt-[2px] rounded-sm bg-surface/80 px-xs py-[1px]">
            <Text className="text-center text-xs font-medium text-textFaint">
              {matchStatus === 'postponed'
                ? 'PPD'
                : kickoffUtc
                  ? new Date(kickoffUtc).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : '—'}
            </Text>
          </View>
        ) : finished && points === null ? (
          // match over, no stats row → never came on
          <View className="mt-[2px] rounded-sm bg-surface/80 px-xs py-[1px]">
            <Text className="text-center text-xs font-medium text-textFaint">DNP</Text>
          </View>
        ) : (
          <View
            className="mt-[2px] min-w-[26px] rounded-sm px-xs py-[1px]"
            style={{
              backgroundColor:
                matchStatus === 'live' ? `${c.primary}2E` : `${c.surfaceRaised}E6`,
            }}
          >
            <Text
              className="text-center text-xs font-bold"
              style={{ color: matchStatus === 'live' ? c.primary : c.textMuted }}
            >
              {displayPoints}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});
