import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { TabBar, type TabKey } from '@/components';
import { useChatUnreadWatcher } from '@/features/chat/useChatUnread';
import { colors } from '@/theme';

const ROUTE_TO_KEY: Record<string, TabKey> = {
  index: 'home',
  roster: 'roster',
  leaderboard: 'leaderboard',
  chat: 'chat',
  league: 'league',
};
const KEY_TO_ROUTE: Partial<Record<TabKey, string>> = {
  home: 'index',
  roster: 'roster',
  leaderboard: 'leaderboard',
  chat: 'chat',
  league: 'league',
};

// Minimal structural type for the bits of the tab-bar props we use (avoids a
// direct @react-navigation/bottom-tabs dependency, absent in the SDK 56 template).
type AppTabBarProps = {
  state: { index: number; routes: { name: string }[] };
  navigation: { navigate: (name: never) => void };
};

/** Custom tab bar — watches for unseen chat messages to show the red dot. */
function AppTabBar({ state, navigation }: AppTabBarProps) {
  const chatUnread = useChatUnreadWatcher();
  return (
    <TabBar
      tabs={['home', 'roster', 'leaderboard', 'chat', 'league']}
      badges={{ chat: chatUnread }}
      active={ROUTE_TO_KEY[state.routes[state.index]?.name] ?? 'home'}
      onChange={(key) => {
        const route = KEY_TO_ROUTE[key];
        if (route) navigation.navigate(route as never);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.bg },
        // cross-tab transition — native only: on web the animated scene wrapper
        // measures 0 height and VirtualizedLists render no items
        animation: Platform.OS === 'web' ? 'none' : 'shift',
      }}
      tabBar={(props) => <AppTabBar {...(props as unknown as AppTabBarProps)} />}
    >
      <Tabs.Screen name="index" options={{ headerShown: false }} />
      <Tabs.Screen name="roster" options={{ title: 'Build your XI' }} />
      <Tabs.Screen name="leaderboard" options={{ headerShown: false }} />
      <Tabs.Screen name="chat" options={{ headerShown: false }} />
      <Tabs.Screen name="league" options={{ headerShown: false }} />
    </Tabs>
  );
}
