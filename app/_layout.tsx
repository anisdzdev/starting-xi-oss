import '../global.css';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { initSentry, withSentry } from '@/lib/sentry';
import { useWebDocumentTitle } from '@/lib/web-title';
import { registerServiceWorker } from '@/lib/webpush';
import { colors, layout } from '@/theme';

initSentry(); // before first render; no-op without EXPO_PUBLIC_SENTRY_DSN

// Dark-first: navigation chrome uses our tokens on top of the stock dark theme.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    text: colors.text,
    primary: colors.primary,
  },
};

/**
 * Desktop web only: pin the app to a phone-shaped centered column so wide
 * viewports don't stretch the UI. Native (and therefore tablets in the native
 * app) render edge-to-edge as before.
 */
function PhoneFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: layout.webMaxWidth }}>{children}</View>
    </View>
  );
}

function RootNavigator() {
  const { session, profile, loading } = useSession();

  // Keep the splash visible until we know which group to show — avoids a
  // sign-in flash for already-authenticated users.
  if (loading) return null;

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Component gallery — dev builds only */}
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="dev/components" />
        <Stack.Screen name="dev/pitch" />
        <Stack.Screen name="dev/lineup-icons" />
        <Stack.Screen name="dev/chat" />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  // Per-route browser tab title (web only; no-op on native).
  useWebDocumentTitle();

  // Offline shell + web push receiver. No-ops on native.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <SessionProvider>
          <StatusBar style="light" />
          <PhoneFrame>
            <RootNavigator />
          </PhoneFrame>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default withSentry(RootLayout);
