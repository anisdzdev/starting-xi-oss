import { useEffect, useRef, useState } from 'react';

/** Fixed count-up duration (ms) — the total always lands in ~this time. */
const DURATION = 850;
/** Ease-out cubic: quick off the mark, gentle settle. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Count-up for the team total. Animates from the current value to `target` over
 * a FIXED duration regardless of the gap — a bigger jump just counts faster
 * instead of dragging on. Eased for a natural settle. Handles increases and
 * decreases (e.g. a voided fixture), and re-targets smoothly mid-animation.
 *
 * First render shows `target` directly (no count-up on mount); only subsequent
 * target changes animate.
 */
export function useCountUpTotal(target: number): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return;

    let raf = 0;
    let start: number | null = null;

    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / DURATION);
      setDisplay(Math.round(from + (target - from) * easeOut(t)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(target); // guard against rounding leaving us a tick short
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}
