import { format, parseISO } from 'date-fns';

import { StepperStrip } from '@/components';

import { stepRound } from './roundLabel';
import type { Round } from './types';

type Props = {
  rounds: Round[];
  selected: Round;
  onSelect: (round: Round) => void;
};

/** "Oct 20 – 21" / "Oct 20" date range of a round. */
function rangeLabel(r: Round): string {
  const a = parseISO(r.startsOn);
  const b = parseISO(r.endsOn);
  if (r.startsOn === r.endsOn) return format(a, 'MMM d');
  return format(a, 'MMM') === format(b, 'MMM')
    ? `${format(a, 'MMM d')} – ${format(b, 'd')}`
    : `${format(a, 'MMM d')} – ${format(b, 'MMM d')}`;
}

/** Round selector: "Matchday 3" with its date range, prev/next arrows over the season's rounds. */
export function RoundStrip({ rounds, selected, onSelect }: Props) {
  const older = stepRound(rounds, selected.key, 'older');
  const newer = stepRound(rounds, selected.key, 'newer');
  return (
    <StepperStrip
      label={selected.label}
      subtitle={rangeLabel(selected)}
      onOlder={older ? () => onSelect(older) : null}
      onNewer={newer ? () => onSelect(newer) : null}
    />
  );
}
