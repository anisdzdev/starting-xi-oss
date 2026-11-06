import { Image } from 'expo-image';
import { User } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Pitch } from '@/features/roster/Pitch';
import { useThemeColors } from '@/theme';

import type { LineupPlayer } from './matchDetails';
import { PlayerFieldIcons } from './PlayerFieldIcons';

const PHOTO = 52; // realistic player-photo bubble (roster slots are ~44)
const SLOT_W = 84;

/** FotMob player headshot — same source the ingest stores for our players. */
function photoUrl(fotmobId: number): string {
  return `https://images.fotmob.com/image_resources/playerimages/${fotmobId}.png`;
}

/**
 * One team's XI on the shared Pitch. FotMob verticalLayout: x left→right (0–1),
 * y own-goal→forward (0–1). Our pitch has the goal at the BOTTOM, so we invert y
 * (top% = (1 - y) * 100) to seat the GK low and forwards high. Each player shows
 * their headshot (silhouette fallback), shirt number + surname, and — once the
 * match has stats — their fantasy points. Players in the caller's saved XI get a
 * gold ring.
 */
export function LineupPitch({ players }: { players: LineupPlayer[] }) {
  const c = useThemeColors();
  return (
    <Pitch variant="clean" style={{ width: '100%', aspectRatio: 100 / 140 }}>
      {players.map((p) => {
        const hasRowMarks = p.goals > 0 || p.assists > 0 || p.cleanSheet;
        return (
        <View
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x * 100}%`,
            top: `${(1 - p.y) * 100}%`,
            width: SLOT_W,
            marginLeft: -SLOT_W / 2,
            marginTop: -PHOTO / 2,
            alignItems: 'center',
          }}
        >
          {/* bubble box — NOT clipped, so the MVP/stat marks can spill out */}
          <View style={{ width: PHOTO, height: PHOTO }}>
            <View
              style={{
                width: PHOTO,
                height: PHOTO,
                borderRadius: PHOTO / 2,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: c.surfaceRaised,
                borderWidth: p.isMine ? 2.5 : 1.5,
                borderColor: p.isMine ? c.captain : c.borderGlass,
              }}
            >
              {/* silhouette fallback sits behind the photo (shows if it 404s) */}
              <User size={PHOTO * 0.5} color={c.textFaint} strokeWidth={1.8} />
              <Image
                source={photoUrl(p.id)}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            </View>
            <PlayerFieldIcons
              size={PHOTO}
              goals={p.goals}
              assists={p.assists}
              cleanSheet={p.cleanSheet}
              isMotm={p.isMotm}
            />
          </View>

          <View
            className="flex-row items-center gap-[3px] rounded-sm bg-overlay px-xs py-[1px]"
            style={{ marginTop: hasRowMarks ? 10 : 4 }}
          >
            {p.shirt ? (
              <Text className="text-xs font-bold text-textFaint">{p.shirt}</Text>
            ) : null}
            <Text numberOfLines={1} className="shrink text-center text-xs font-semibold text-text">
              {p.name}
            </Text>
          </View>

          {p.points !== null ? (
            <View
              className="mt-[2px] min-w-[26px] rounded-sm px-xs py-[1px]"
              style={{ backgroundColor: `${c.surfaceRaised}E6` }}
            >
              <Text className="text-center text-xs font-bold" style={{ color: c.textMuted }}>
                {p.points}
              </Text>
            </View>
          ) : null}
        </View>
        );
      })}
    </Pitch>
  );
}
