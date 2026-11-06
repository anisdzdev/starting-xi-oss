import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

type Props = {
  /** Target instant (e.g. next kickoff). */
  target: Date | string | number;
  /** Called once when the countdown hits zero. */
  onComplete?: () => void;
};

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function partsUntil(target: number): Parts {
  const ms = Math.max(0, target - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3_600),
    minutes: Math.floor((s % 3_600) / 60),
    seconds: s % 60,
  };
}

/** A digit that slides/fades when its value changes (reanimated entering/exiting — web-safe). */
function Digit({ value, color }: { value: string; color: string }) {
  return (
    <View className="h-[34px] w-[22px] items-center justify-center overflow-hidden">
      {/* explicit styles: className is not processed on reanimated components */}
      <Animated.Text
        key={value}
        entering={FadeInDown.duration(220)}
        exiting={FadeOutUp.duration(180)}
        style={{ fontSize: 24, lineHeight: 32, fontWeight: '700', color }}
      >
        {value}
      </Animated.Text>
    </View>
  );
}

function Unit({ value, label, urgent }: { value: number; label: string; urgent: boolean }) {
  const c = useThemeColors();
  const str = String(value).padStart(2, '0');
  return (
    <View className="items-center gap-xs">
      <View
        className="flex-row rounded-md border px-xs py-xs"
        style={{
          borderColor: urgent ? `${c.live}66` : c.border,
          backgroundColor: urgent ? `${c.live}14` : c.surface,
        }}
      >
        <Digit value={str[0]} color={urgent ? c.live : c.text} />
        <Digit value={str[1]} color={urgent ? c.live : c.text} />
      </View>
      <Text
        className="text-xs font-medium uppercase"
        style={{ color: urgent ? c.live : c.textFaint }}
      >
        {label}
      </Text>
    </View>
  );
}

export function CountdownTimer({ target, onComplete }: Props) {
  const targetMs = new Date(target).getTime();
  const [parts, setParts] = useState<Parts>(() => partsUntil(targetMs));

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const next = partsUntil(targetMs);
      setParts(next);
      if (
        !fired &&
        next.days === 0 &&
        next.hours === 0 &&
        next.minutes === 0 &&
        next.seconds === 0
      ) {
        fired = true;
        onComplete?.();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, onComplete]);

  // urgency: red shift when kickoff is < 30 minutes away
  const urgent =
    parts.days === 0 && parts.hours === 0 && (parts.minutes > 0 || parts.seconds > 0) &&
    parts.minutes < 30;

  return (
    <View className="flex-row items-start gap-md">
      <Unit value={parts.days} label="days" urgent={urgent} />
      <Unit value={parts.hours} label="hrs" urgent={urgent} />
      <Unit value={parts.minutes} label="min" urgent={urgent} />
      <Unit value={parts.seconds} label="sec" urgent={urgent} />
    </View>
  );
}
