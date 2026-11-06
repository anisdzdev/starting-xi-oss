import { Flame, Goal, Search, Target, Timer, Trophy, Zap } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  Avatar,
  FlagBadge,
  BottomSheet,
  Button,
  Card,
  CountdownTimer,
  EmptyState,
  Screen,
  ScoringInfoButton,
  Skeleton,
  SkeletonRow,
  StatChip,
  TabBar,
  TextField,
  type TabKey,
} from '@/components';
import { FormationDiagram } from '@/features/roster/FormationCard';
import { Pitch } from '@/features/roster/Pitch';
import { PlayerSlot } from '@/features/roster/PlayerSlot';
import { gradients, useThemeColors } from '@/theme';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-md">
      <Text className="text-sm font-semibold uppercase tracking-widest text-textFaint">
        {title}
      </Text>
      {children}
    </View>
  );
}

const KICKOFF = new Date(Date.now() + 26 * 3600_000 + 26 * 60_000 + 26_000);

// Data-URI assets so the filled-slot demo renders a visible photo + flag with no
// network dependency.
const DEMO_PHOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><rect width='44' height='44' fill='%231A2238'/><circle cx='22' cy='17' r='8' fill='%235A6781'/><circle cx='22' cy='42' r='15' fill='%235A6781'/></svg>";
const DEMO_FLAG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><circle cx='6' cy='6' r='6' fill='%2334D399'/></svg>";
const GALLERY_PLAYER = {
  id: 1,
  name: 'Vinícius Júnior',
  position: 'FWD' as const,
  imageUrl: DEMO_PHOTO,
  teamCode: 'BRA',
  flagUrl: DEMO_FLAG,
};

export default function ComponentGallery() {
  const c = useThemeColors();
  const [tab, setTab] = useState<TabKey>('home');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [field, setField] = useState('');

  return (
    <Screen glow="hype" edges={['top']}>
      <ScrollView contentContainerClassName="gap-2xl px-xl py-xl pb-4xl">
        <View className="gap-xs">
          <Text className="text-3xl font-bold text-text">Components</Text>
          <Text className="text-sm text-textMuted">
            Every shared component and state, on one screen. Dev builds only.
          </Text>
        </View>

        <Section title="Theme palette">
          <View className="flex-row flex-wrap gap-sm">
            {(
              [
                ['primary', c.primary],
                ['accentPurple', c.accentPurple],
                ['accentBlue', c.accentBlue],
                ['accentCyan', c.accentCyan],
                ['accentLime', c.accentLime],
                ['accentPink', c.accentPink],
                ['accentOrange', c.accentOrange],
                ['accentGold', c.accentGold],
                ['danger', c.danger],
              ] as const
            ).map(([name, value]) => (
              <View key={name} className="items-center gap-xs">
                <View
                  className="h-[44px] w-[44px] rounded-md border border-border"
                  style={{ backgroundColor: value }}
                />
                <Text className="text-xs text-textFaint">{name}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Buttons">
          <View className="gap-md">
            <Button title="Primary" onPress={() => {}} />
            <Button title="Ghost" variant="ghost" onPress={() => {}} />
            <Button title="Danger" variant="danger" onPress={() => {}} />
            <View className="flex-row gap-md">
              <View className="flex-1">
                <Button title="Loading" loading onPress={() => {}} />
              </View>
              <View className="flex-1">
                <Button title="Disabled" disabled onPress={() => {}} />
              </View>
            </View>
          </View>
        </Section>

        <Section title="Cards">
          <Card variant="glass">
            <Text className="font-semibold text-text">Glass card</Text>
            <Text className="text-sm text-textMuted">
              Translucent surface with hairline border — sits on the screen glow.
            </Text>
          </Card>
          <Card variant="elevated">
            <Text className="font-semibold text-text">Elevated card</Text>
            <Text className="text-sm text-textMuted">Solid raised surface with shadow.</Text>
          </Card>
        </Section>

        <Section title="Avatar">
          <View className="flex-row items-end gap-lg">
            <Avatar name="Anis B" size={56} />
            <Avatar
              uri="https://api.dicebear.com/9.x/bottts-neutral/png?seed=daily-xi-3&size=128"
              size={56}
            />
            <Avatar
              uri="https://api.dicebear.com/9.x/bottts-neutral/png?seed=daily-xi-7&size=128"
              size={56}
              ring="captain"
            />
            <Avatar name="Live Guy" size={56} ring="live" />
            <Avatar name="P" size={32} ring="primary" />
          </View>
        </Section>

        <Section title="FlagBadge">
          <View className="flex-row items-end gap-lg">
            <FlagBadge uri="https://images.fotmob.com/image_resources/logo/teamlogo/6710.png" size={44} />
            <FlagBadge uri="https://images.fotmob.com/image_resources/logo/teamlogo/6316.png" size={44} variant="crest" />
            <FlagBadge uri="https://images.fotmob.com/image_resources/logo/teamlogo/6707.png" size={44} live />
            <FlagBadge code="ARG" size={44} />
            <FlagBadge code="BRA" size={44} variant="crest" />
          </View>
          <Text className="text-xs text-textFaint">round (FotMob) · crest (FIFA) · live ring · code fallbacks</Text>
        </Section>

        <Section title="StatChip">
          <View className="flex-row flex-wrap gap-sm">
            <StatChip icon={Goal} label="Goals" value={2} tone="success" />
            <StatChip icon={Zap} label="Bonus" value={3} tone="gold" />
            <StatChip icon={Timer} label="Minutes" value={90} />
            <StatChip icon={Flame} label="Live" value="67'" tone="live" />
            <StatChip icon={Target} label="xG" value="1.42" tone="accent" />
            <StatChip icon={Trophy} label="Rank" value="#1" tone="danger" />
          </View>
        </Section>

        <Section title="CountdownTimer">
          <Card variant="glass">
            <View className="items-center gap-md">
              <Text className="text-sm text-textMuted">Next kickoff</Text>
              <CountdownTimer target={KICKOFF} />
            </View>
          </Card>
        </Section>

        <Section title="TextField">
          <TextField
            label="Display name"
            value={field}
            onChangeText={setField}
            placeholder="Type something"
          />
          <TextField label="With error" value="" onChangeText={() => {}} error="This is the error state" />
        </Section>

        <Section title="Skeleton">
          <View className="gap-md">
            <SkeletonRow />
            <SkeletonRow />
            <View className="flex-row gap-md">
              <Skeleton width={120} height={72} radius={14} />
              <Skeleton width={120} height={72} radius={14} />
            </View>
          </View>
        </Section>

        <Section title="EmptyState">
          <Card variant="elevated">
            <EmptyState
              icon={Search}
              title="No players found"
              message="Try a different name, or clear the position filter."
              action={<Button title="Clear filters" variant="ghost" onPress={() => {}} />}
            />
          </Card>
        </Section>

        <Section title="BottomSheet">
          <Button title="Open bottom sheet" onPress={() => setSheetOpen(true)} />
        </Section>

        <Section title="Scoring rules">
          <View className="flex-row items-center gap-md">
            <ScoringInfoButton />
            <ScoringInfoButton variant="link" />
          </View>
        </Section>

        <Section title="TabBar">
          <Card variant="elevated" className="p-none overflow-hidden">
            <TabBar active={tab} onChange={setTab} inset={false} />
          </Card>
          <Text className="text-xs text-textFaint">Active: {tab}</Text>
        </Section>

        <Section title="Roster pitch">
          <View style={{ height: 380 }}>
            <Pitch variant="striped" style={{ flex: 1 }}>
              <PlayerSlot position="FWD" player={null} x={50} y={21} onPress={() => {}} />
              <PlayerSlot position="MID" player={GALLERY_PLAYER} isCaptain x={30} y={43} onPress={() => {}} />
              <PlayerSlot position="MID" player={null} x={70} y={43} onPress={() => {}} />
              <PlayerSlot position="DEF" player={null} x={50} y={65} onPress={() => {}} />
              {/* filled GK at the bottom line — its name/flag pill must not clip */}
              <PlayerSlot position="GK" player={GALLERY_PLAYER} x={50} y={85} onPress={() => {}} />
            </Pitch>
          </View>
          <View className="flex-row items-center gap-md">
            <FormationDiagram code="4-4-2" />
            <FormationDiagram code="3-5-2" selected />
            <FormationDiagram code="5-2-3" />
          </View>
        </Section>

        <Section title="Screen glows">
          <View className="flex-row gap-md">
            {(['hype', 'pitch', 'live'] as const).map((g) => (
              <View key={g} className="items-center gap-xs">
                <View
                  className="h-[44px] w-[88px] rounded-md border border-border"
                  style={{ backgroundColor: c.bg }}
                >
                  <View
                    className="absolute right-0 top-0 h-[30px] w-[40px] rounded-full opacity-40"
                    style={{ backgroundColor: gradients[g][0] }}
                  />
                </View>
                <Text className="text-xs text-textFaint">{g}</Text>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View className="gap-md pb-lg">
          <Text className="text-lg font-semibold text-text">Bottom sheet</Text>
          <Text className="text-sm text-textMuted">
            Drag the handle down or tap the backdrop to dismiss. Spring physics on open,
            velocity-aware dismiss.
          </Text>
          <Button title="Close" variant="ghost" onPress={() => setSheetOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
