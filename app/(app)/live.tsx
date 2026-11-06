import { useState } from 'react';
import { View } from 'react-native';

import { DayStrip } from '@/features/live/DayStrip';
import { LiveRosterView } from '@/features/live/LiveRosterView';
import { roundOfDay, useRounds } from '@/features/rounds';
import { useActiveSeason } from '@/features/seasons';
import { colors } from '@/theme';
import { currentGameDay } from '@/shared/gameday';

export default function LiveScreen() {
  const today = currentGameDay();
  const [day, setDay] = useState(today);
  // Bound the day arrows to the active season so they don't walk back into the archive.
  const season = useActiveSeason();
  const rounds = useRounds(season?.id ?? null);
  const round = roundOfDay(rounds ?? [], day);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DayStrip
        selected={day}
        onSelect={setDay}
        from={season?.startsOn}
        subtitle={round?.label ?? null}
      />
      <View style={{ flex: 1 }}>
        {/* key forces a clean remount per day so stats/ticker/realtime reset */}
        {/* Only today's XI can still be built — past days show a static message. */}
        <LiveRosterView key={day} gameDay={day} buildable={day === today} />
      </View>
    </View>
  );
}
