import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components';
import { PlayerSearchList, type PlayerOption } from '@/features/picks/PickSteps';

import type { PickKind } from './types';

type Props = {
  visible: boolean;
  seasonId: string;
  kind: PickKind;
  /** Current pick, if changing one. */
  selectedId: number | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (player: PlayerOption) => void;
};

/** Choose the keeper / outfield player whose points count for a 'pick' competition. */
export function PickSheet({ visible, seasonId, kind, selectedId, busy, onClose, onConfirm }: Props) {
  const [chosen, setChosen] = useState<PlayerOption | null>(null);
  const current = chosen?.id ?? selectedId;
  const close = () => {
    setChosen(null); // a fresh choice next time the sheet opens
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={close}>
      <View className="gap-md px-xl pb-xl pt-md" style={{ maxHeight: 560 }}>
        <Text className="text-lg font-bold text-text">
          {kind === 'keeper' ? 'Pick your keeper' : 'Pick your player'}
        </Text>
        <Text className="text-sm text-textMuted">
          {kind === 'keeper'
            ? 'Their clean sheets and saves score for you across the competition.'
            : 'Their goals, assists and bonus score for you across the competition.'}
        </Text>
        <View style={{ maxHeight: 360 }}>
          <PlayerSearchList
            seasonId={seasonId}
            gkOnly={kind === 'keeper'}
            outfieldOnly={kind === 'player'}
            selectedId={current}
            onSelect={setChosen}
          />
        </View>
        <Button
          title={chosen ? `Confirm ${chosen.name}` : 'Choose a player'}
          disabled={!chosen || busy}
          onPress={() => {
            if (!chosen) return;
            const pick = chosen;
            setChosen(null);
            onConfirm(pick);
          }}
        />
      </View>
    </BottomSheet>
  );
}
