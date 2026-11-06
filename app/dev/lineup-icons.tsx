import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components';
import { LineupPitch } from '@/features/live/LineupPitch';
import { LiveSlot } from '@/features/live/LiveSlot';
import type { DbStats, LiveRosterPlayer } from '@/features/live/useLiveRoster';
import type { LineupPlayer } from '@/features/live/matchDetails';
import { Pitch } from '@/features/roster/Pitch';
import type { Position } from '@/shared/scoring';

// Dev-only screen to eyeball the goal/assist/MVP/clean-sheet marks on the
// lineup bubbles without needing auth or live data.

const IMG = (id: number) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

function mockStats(over: Partial<DbStats>): DbStats {
  return {
    player_id: 0,
    minutes: 90,
    goals: 0,
    assists: 0,
    clean_sheet: false,
    saves: 0,
    pen_saves: 0,
    pen_misses: 0,
    yellows: 0,
    reds: 0,
    own_goals: 0,
    goals_conceded: 0,
    rating: null,
    bonus: 0,
    fpl_points: 0,
    ...over,
  };
}

function mockPlayer(id: number, name: string, position: Position, over: Partial<LiveRosterPlayer> = {}): LiveRosterPlayer {
  return {
    slot: 1,
    id,
    fotmobId: id,
    name,
    position,
    imageUrl: IMG(id),
    teamId: 1,
    teamCode: 'ESP',
    flagUrl: 'https://images.fotmob.com/image_resources/logo/teamlogo/6316_small.png',
    isCaptain: false,
    ...over,
  };
}

// x/y percentages roughly matching a formation for the LiveSlot demo.
const liveDemo: {
  player: LiveRosterPlayer;
  stats: DbStats | null;
  isMotm: boolean;
  status: 'scheduled' | 'live' | 'finished';
  x: number;
  y: number;
}[] = [
  {
    player: mockPlayer(720560, 'Oyarzabal', 'FWD'),
    stats: mockStats({ goals: 2, fpl_points: 12 }),
    isMotm: true,
    status: 'live',
    x: 50,
    y: 18,
  },
  {
    player: mockPlayer(1227878, 'Baena', 'MID'),
    stats: mockStats({ assists: 1, fpl_points: 5 }),
    isMotm: false,
    status: 'live',
    x: 25,
    y: 42,
  },
  {
    player: mockPlayer(737066, 'Rodri', 'MID', { isCaptain: true }),
    stats: mockStats({ goals: 1, assists: 1, fpl_points: 9 }),
    isMotm: false,
    status: 'live',
    x: 75,
    y: 42,
  },
  {
    player: mockPlayer(1097932, 'Cubarsí', 'DEF'),
    stats: mockStats({ clean_sheet: true, fpl_points: 6 }),
    isMotm: false,
    status: 'finished',
    x: 32,
    y: 66,
  },
  {
    player: mockPlayer(253991, 'Simón', 'GK'),
    stats: mockStats({ clean_sheet: true, saves: 4, fpl_points: 8 }),
    isMotm: false,
    status: 'finished',
    x: 68,
    y: 66,
  },
  {
    player: mockPlayer(961995, 'Yamal', 'FWD'),
    stats: mockStats({ fpl_points: 2 }),
    isMotm: false,
    status: 'live',
    x: 50,
    y: 86,
  },
];

const lineupDemo: LineupPlayer[] = [
  { id: 253991, name: 'Simón', shirt: '23', x: 0.5, y: 0.1, isMine: false, points: 8, goals: 0, assists: 0, cleanSheet: true, isMotm: false },
  { id: 1097932, name: 'Cubarsí', shirt: '22', x: 0.3, y: 0.32, isMine: true, points: 6, goals: 0, assists: 0, cleanSheet: true, isMotm: false },
  { id: 1227878, name: 'Baena', shirt: '15', x: 0.7, y: 0.5, isMine: false, points: 5, goals: 0, assists: 1, cleanSheet: false, isMotm: false },
  { id: 737066, name: 'Rodri', shirt: '16', x: 0.3, y: 0.5, isMine: false, points: 9, goals: 1, assists: 1, cleanSheet: false, isMotm: false },
  { id: 720560, name: 'Oyarzabal', shirt: '21', x: 0.5, y: 0.85, isMine: true, points: 12, goals: 2, assists: 0, cleanSheet: false, isMotm: true },
];

export default function LineupIconsDev() {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-lg font-bold text-text">LiveSlot marks (goal/assist/CS/MVP)</Text>
        <Pitch variant="clean" style={{ width: '100%', aspectRatio: 100 / 140 }}>
          {liveDemo.map((d) => (
            <LiveSlot
              key={d.player.id}
              player={d.player}
              points={d.stats ? (d.player.isCaptain ? d.stats.fpl_points * 2 : d.stats.fpl_points) : null}
              stats={d.stats}
              isMotm={d.isMotm}
              matchStatus={d.status}
              kickoffUtc={null}
              flashKey={undefined}
              x={d.x}
              y={d.y}
              onPress={() => {}}
            />
          ))}
        </Pitch>

        <Text className="text-lg font-bold text-text">LineupPitch marks (match sheet)</Text>
        <LineupPitch players={lineupDemo} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}
