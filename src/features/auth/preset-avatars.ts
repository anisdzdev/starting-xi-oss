/** 10 preset avatars (DiceBear, PNG for native compatibility). */
export const PRESET_AVATARS: string[] = Array.from(
  { length: 10 },
  (_, i) =>
    `https://api.dicebear.com/9.x/bottts-neutral/png?seed=daily-xi-${i + 1}&size=128`
);
