import 'dotenv/config';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Env vars are loaded from .env (see .env.example) and exposed to the app
 * through `extra` — read them via src/lib/env.ts, never process.env directly
 * in runtime code.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Starting XI',
  slug: 'starting-xi',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'startingxi',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0F14',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.novem.startingxi',
    // Signing team for the app + the widget extension (Live Activities).
    // Set APPLE_TEAM_ID in .env; falls back to EAS-managed signing if unset.
    appleTeamId: process.env.APPLE_TEAM_ID,
    entitlements: {
      // remote push (expo-notifications); 'production' covers TestFlight + App Store
      'aps-environment': 'production',
      // shared container with the Live Activity widget (photo/flag cache)
      'com.apple.security.application-groups': ['group.com.novem.startingxi'],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // required for ActivityKit Live Activities
      NSSupportsLiveActivities: true,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0B0F14',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B0F14',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
    'expo-image',
    'expo-notifications',
    [
      'expo-image-picker',
      {
        photosPermission: 'Starting XI uses your photos so you can set a profile avatar.',
      },
    ],
    // Sentry native crash handling; source-map upload needs SENTRY_AUTH_TOKEN
    // at EAS build time (see DEPLOYMENT.md) and is skipped without it.
    '@sentry/react-native/expo',
    // Live Activity widget extension target (targets/widget/). Adds the
    // ActivityKit/WidgetKit/SwiftUI target at prebuild; UI lives in Swift.
    '@bacons/apple-targets',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    inviteCode: process.env.INVITE_CODE ?? '',
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    eas: {
      projectId: '07604449-dec5-4292-8537-13d0a223039e',
    },
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  // EAS Update (expo-updates): production builds on channel "production" pull
  // JS-only releases from here (`eas update --channel production --environment production`).
  updates: {
    url: 'https://u.expo.dev/07604449-dec5-4292-8537-13d0a223039e',
  },
});
