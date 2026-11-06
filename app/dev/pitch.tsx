import { View } from 'react-native';

import { Screen } from '@/components';
import { Pitch } from '@/features/roster/Pitch';
import { PlayerSlot } from '@/features/roster/PlayerSlot';
import { slotLayout } from '@/features/roster/formations';

/** Dev-only: full pitch + empty 4-3-3 slots, for eyeballing the SVG art on device. */
export default function PitchPreview() {
  return (
    <Screen glow="pitch" edges={['top', 'bottom']}>
      <View style={{ flex: 1, margin: 12 }}>
        <Pitch style={{ flex: 1 }}>
          {slotLayout('4-3-3').map((p) => (
            <PlayerSlot
              key={p.slot}
              position={p.position}
              player={null}
              x={p.x}
              y={p.y}
              onPress={() => {}}
            />
          ))}
        </Pitch>
      </View>
    </Screen>
  );
}
