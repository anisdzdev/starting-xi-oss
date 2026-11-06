import {
  Home,
  MessageCircle,
  Shirt,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing, useThemeColors } from '@/theme';

export type TabKey = 'home' | 'roster' | 'leaderboard' | 'chat' | 'league' | 'profile';

export const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'roster', label: 'Roster', icon: Shirt },
  { key: 'leaderboard', label: 'Table', icon: Trophy },
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'league', label: 'League', icon: Users },
  { key: 'profile', label: 'You', icon: User },
];

type Props = {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /** Skip bottom safe-area inset (e.g. in the dev gallery). */
  inset?: boolean;
  /** Subset/order of tabs to show (defaults to all). */
  tabs?: TabKey[];
  /** Tabs that should show a red unread dot. */
  badges?: Partial<Record<TabKey, boolean>>;
};

function TabItem({
  tab,
  isActive,
  badge,
  onPress,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  badge?: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const scale = useSharedValue(1);
  const bounce = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const Icon = tab.icon;

  return (
    <Pressable
      onPress={() => {
        scale.set(
          withSequence(
            withSpring(0.88, { damping: 16, stiffness: 360 }),
            withSpring(1, { damping: 12, stiffness: 280 })
          )
        );
        onPress();
      }}
      className="flex-1 items-center gap-xs py-sm"
    >
      {/* explicit styles: className is not processed on reanimated components */}
      <Animated.View
        style={[
          bounce,
          {
            borderRadius: radii.full,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.xs,
            backgroundColor: isActive ? `${c.primary}26` : 'transparent',
          },
        ]}
      >
        <Icon
          size={22}
          color={isActive ? c.primary : c.textFaint}
          strokeWidth={isActive ? 2.4 : 2}
        />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: spacing.lg - 6,
              width: 9,
              height: 9,
              borderRadius: radii.full,
              backgroundColor: c.live,
              borderWidth: 1.5,
              borderColor: c.surface,
            }}
          />
        ) : null}
      </Animated.View>
      <Text
        className={`text-xs font-medium ${isActive ? 'text-primary' : 'text-textFaint'}`}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

export function TabBar({ active, onChange, inset = true, tabs, badges }: Props) {
  const shown = tabs ? TABS.filter((t) => tabs.includes(t.key)) : TABS;
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row bg-surface"
      style={{ paddingBottom: inset ? insets.bottom : 0 }}
    >
      {shown.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          isActive={active === tab.key}
          badge={badges?.[tab.key]}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </View>
  );
}
