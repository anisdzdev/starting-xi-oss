import { addDays, format, parseISO, subDays } from 'date-fns';
import { useEffect, useState } from 'react';

import { StepperStrip } from '@/components';
import { getSupabase } from '@/lib/supabase';

import { stepDay } from './dayStep';
import { currentGameDay } from '@/shared/gameday';

type Props = {
  selected: string;
  onSelect: (day: string) => void;
  /** Inclusive YYYY-MM-DD bounds (e.g. a season's range). Defaults: no lower bound, today. */
  from?: string;
  to?: string;
  /** Small muted line under the day label (e.g. the day's matchday). */
  subtitle?: string | null;
};

/** Human label for a game day relative to today. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === format(subDays(parseISO(today), 1), 'yyyy-MM-dd')) return 'Yesterday';
  if (day === format(addDays(parseISO(today), 1), 'yyyy-MM-dd')) return 'Tomorrow';
  return format(parseISO(day), 'EEE d');
}

/**
 * Game-day selector: a centered label with prev/next arrows.
 * Days run oldest → newest, so the LEFT arrow steps back in time and the
 * RIGHT arrow steps forward. Arrows disable at the ends of the range.
 */
export function DayStrip({ selected, onSelect, from, to, subtitle }: Props) {
  const today = currentGameDay();
  const upper = to ?? today;
  // Ascending (oldest first) so arrow direction maps to time direction.
  const [days, setDays] = useState<string[]>([selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = getSupabase().from('fixtures').select('game_day').lte('game_day', upper);
      if (from) q = q.gte('game_day', from);
      const { data } = await q.order('game_day', { ascending: true });
      if (cancelled) return;
      const unique = [...new Set((data ?? []).map((r) => (r as { game_day: string }).game_day))];
      setDays(unique.length > 0 ? unique : [upper]);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, upper]);

  // The selected day is often NOT a fixture day (rest days between matchdays,
  // or a season's placeholder end date) — step to the nearest one either side.
  const older = stepDay(days, selected, 'older');
  const newer = stepDay(days, selected, 'newer');

  const goOlder = () => {
    if (older) onSelect(older);
  };
  const goNewer = () => {
    if (newer) onSelect(newer);
  };

  return (
    <StepperStrip
      label={dayLabel(selected, today)}
      subtitle={subtitle}
      onOlder={older ? goOlder : null}
      onNewer={newer ? goNewer : null}
    />
  );
}
