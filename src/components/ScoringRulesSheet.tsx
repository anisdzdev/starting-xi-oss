import {
  ClipboardList,
  Info,
  Shield,
  Sparkles,
  Star,
  Timer,
  TrendingDown,
  Crown,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Card } from './Card';
import { CAPTAIN_MULTIPLIER, COACH_POINTS, POINTS } from '@/shared/scoring';
import { useThemeColors } from '@/theme';

type Sign = 'pos' | 'neg' | 'special';
type RuleRow = { label: string; value: string; sign: Sign };
type RuleSection = { title: string; icon: LucideIcon; tone: Sign; rows: RuleRow[] };

/** "+6" / "-1" — matches how points read elsewhere in the app. */
const fmt = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/**
 * Friendly explainer for the per-match FPL scoring. Point values come straight
 * from src/shared/scoring.ts (POINTS / CAPTAIN_MULTIPLIER) so this can never
 * drift from the real scoring logic — the only literals are the appearance
 * minute gate and the 3/2/1 bonus split (which live in scoring functions, not
 * the POINTS map).
 */
const SECTIONS: RuleSection[] = [
  {
    title: 'Playing time',
    icon: Timer,
    tone: 'pos',
    rows: [
      { label: 'Played up to 60 minutes', value: fmt(POINTS.appearance), sign: 'pos' },
      { label: 'Played 60+ minutes', value: fmt(POINTS.appearance60), sign: 'pos' },
    ],
  },
  {
    title: 'Attacking',
    icon: Sparkles,
    tone: 'pos',
    rows: [
      { label: 'Goal — Goalkeeper or Defender', value: fmt(POINTS.goal.GK), sign: 'pos' },
      { label: 'Goal — Midfielder', value: fmt(POINTS.goal.MID), sign: 'pos' },
      { label: 'Goal — Forward', value: fmt(POINTS.goal.FWD), sign: 'pos' },
      { label: 'Assist', value: fmt(POINTS.assist), sign: 'pos' },
    ],
  },
  {
    title: 'Defending & goalkeeping',
    icon: Shield,
    tone: 'pos',
    rows: [
      { label: 'Clean sheet — GK or Defender (60+ min)', value: fmt(POINTS.cleanSheet.GK), sign: 'pos' },
      { label: 'Clean sheet — Midfielder (60+ min)', value: fmt(POINTS.cleanSheet.MID), sign: 'pos' },
      { label: 'Every 3 saves (Goalkeeper)', value: fmt(POINTS.per3Saves), sign: 'pos' },
      { label: 'Penalty save (Goalkeeper)', value: fmt(POINTS.penSave), sign: 'pos' },
      { label: 'Every 2 goals conceded (GK or Defender)', value: fmt(POINTS.per2Conceded), sign: 'neg' },
    ],
  },
  {
    title: 'Deductions',
    icon: TrendingDown,
    tone: 'neg',
    rows: [
      { label: 'Yellow card', value: fmt(POINTS.yellow), sign: 'neg' },
      { label: 'Red card', value: fmt(POINTS.red), sign: 'neg' },
      { label: 'Penalty miss', value: fmt(POINTS.penMiss), sign: 'neg' },
      { label: 'Own goal', value: fmt(POINTS.ownGoal), sign: 'neg' },
    ],
  },
  {
    title: 'Bonus',
    icon: Star,
    tone: 'special',
    rows: [
      { label: 'Top 3 match ratings in a game', value: '+3 / +2 / +1', sign: 'special' },
    ],
  },
  {
    title: 'Captain',
    icon: Crown,
    tone: 'special',
    rows: [
      { label: "Your captain's points are doubled", value: `×${CAPTAIN_MULTIPLIER}`, sign: 'special' },
    ],
  },
  {
    title: 'Coach of the day',
    icon: ClipboardList,
    tone: 'special',
    rows: [
      { label: 'A substitute scores a goal', value: fmt(COACH_POINTS.subGoal), sign: 'pos' },
      { label: 'A substitute gets an assist', value: fmt(COACH_POINTS.subAssist), sign: 'pos' },
      { label: 'A substitute is Man of the Match', value: fmt(COACH_POINTS.subMotm), sign: 'pos' },
      { label: 'Team wins', value: fmt(COACH_POINTS.win), sign: 'pos' },
      { label: 'Team draws', value: fmt(COACH_POINTS.draw), sign: 'special' },
      { label: 'Team loses', value: fmt(COACH_POINTS.loss), sign: 'neg' },
      { label: 'Coach yellow card', value: fmt(COACH_POINTS.yellow), sign: 'neg' },
      { label: 'Coach red card', value: fmt(COACH_POINTS.red), sign: 'neg' },
    ],
  },
];

function valueColor(sign: Sign, c: ReturnType<typeof useThemeColors>): string {
  if (sign === 'neg') return c.danger;
  if (sign === 'special') return c.captain;
  return c.success;
}

function iconColor(tone: Sign, c: ReturnType<typeof useThemeColors>): string {
  if (tone === 'neg') return c.danger;
  if (tone === 'special') return c.captain;
  return c.primary;
}

type SheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** Controlled bottom sheet listing every per-match scoring rule. */
export function ScoringRulesSheet({ visible, onClose }: SheetProps) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="gap-md pb-lg">
        <View className="gap-xs">
          <Text className="text-lg font-semibold text-text">How points work</Text>
          <Text className="text-sm text-textMuted">
            Each player earns points from their real match. Your score is all 11 added
            together — and your captain counts double.
          </Text>
        </View>

        <ScrollView className="max-h-[460px]" showsVerticalScrollIndicator={false}>
          <View className="gap-md pb-sm">
            {SECTIONS.map((section) => (
              <Card key={section.title} variant="glass" className="gap-sm">
                <View className="flex-row items-center gap-sm">
                  <section.icon size={15} color={iconColor(section.tone, c)} strokeWidth={2.2} />
                  <Text className="text-xs font-bold uppercase tracking-widest text-textFaint">
                    {section.title}
                  </Text>
                </View>
                {section.rows.map((r) => (
                  <View key={r.label} className="flex-row items-center justify-between gap-md">
                    <Text className="flex-1 text-sm text-textMuted">{r.label}</Text>
                    <Text className="text-sm font-bold" style={{ color: valueColor(r.sign, c) }}>
                      {r.value}
                    </Text>
                  </View>
                ))}
              </Card>
            ))}
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

type ButtonProps = {
  /** 'icon' = round (i) affordance; 'link' = inline text link. */
  variant?: 'icon' | 'link';
  /** Icon tint for the 'icon' variant (defaults to muted). */
  color?: string;
};

/**
 * Self-contained trigger for {@link ScoringRulesSheet} — owns its open state, so
 * a screen just drops `<ScoringInfoButton />` wherever the explainer belongs.
 */
export function ScoringInfoButton({ variant = 'icon', color }: ButtonProps) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'link' ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="View all scoring rules"
          className="flex-row items-center gap-xs self-start py-xs active:opacity-60"
        >
          <Info size={14} color={c.textMuted} strokeWidth={2.2} />
          <Text className="text-sm font-medium text-textMuted">View all scoring rules</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How points work"
          className="h-[30px] w-[30px] items-center justify-center rounded-full border border-border bg-surface active:opacity-70"
        >
          <Info size={16} color={color ?? c.textMuted} strokeWidth={2.2} />
        </Pressable>
      )}
      <ScoringRulesSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
