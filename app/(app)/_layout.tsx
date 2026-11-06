import { router, Stack, useNavigation } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { CoachAnnouncement } from '@/features/announcements/CoachAnnouncement';
import { useLiveActivityRegistration } from '@/features/live-activity';
import { useSeasonStore } from '@/features/seasons';
import { registerPushToken } from '@/lib/notifications';
import { colors } from '@/theme';

// Anchor the stack on the tabs group: when the app is cold-launched via a deep
// link (e.g. the Live Activity's `startingxi://live`), Expo Router synthesizes
// (tabs) beneath the pushed screen so a back chevron appears and returns Home.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/**
 * Back chevron that always works — even on a cold deep-link launch where the
 * navigation stack has no history. Falls back to replacing into the tabs group.
 */
function HomeFallbackBack() {
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (navigation.canGoBack()) navigation.goBack();
        else router.replace('/(app)/(tabs)');
      }}
      hitSlop={12}
      style={{ paddingRight: 8 }}
    >
      <ChevronLeft size={28} color={colors.text} strokeWidth={2.2} />
    </Pressable>
  );
}

export default function AppLayout() {
  // Refresh the push token every time a signed-in, onboarded user opens the app.
  // No-ops on web / simulators / Expo Go.
  useEffect(() => {
    registerPushToken();
    // Seasons are reference data shared by Standings/Home/League — load once per session.
    useSeasonStore.getState().load();
  }, []);

  // Register Live Activity push tokens + warm the widget image cache (iOS 16.2+).
  useLiveActivityRegistration();

  return (
    <>
      <CoachAnnouncement />
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        // Pushed screens sit above the (tabs) group, which has no title — without
        // this the iOS back button falls back to the raw route name "(tabs)".
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="live"
        options={{ title: 'Live', headerLeft: () => <HomeFallbackBack /> }}
      />
      <Stack.Screen name="picks" options={{ title: 'Tournament picks' }} />
      <Stack.Screen name="team/[userId]" options={{ title: 'Team' }} />
      <Stack.Screen name="competitions/index" options={{ title: 'Competitions' }} />
      <Stack.Screen name="competitions/new" options={{ title: 'New competition' }} />
      <Stack.Screen name="competitions/[id]" options={{ title: 'Competition' }} />
      </Stack>
    </>
  );
}
