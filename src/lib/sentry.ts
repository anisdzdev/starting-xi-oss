import * as Sentry from '@sentry/react-native';

/**
 * Crash + error reporting (native AND web — @sentry/react-native delegates to
 * the browser SDK on web). Entirely disabled until EXPO_PUBLIC_SENTRY_DSN is
 * set, so local dev and keyless checkouts stay clean.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const sentryEnabled = DSN.length > 0;

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    // free-tier friendly sampling
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

/** Wrap the root component (adds touch/navigation instrumentation on native). */
export function withSentry<C extends React.ComponentType<Record<string, unknown>>>(
  component: C
): C {
  return sentryEnabled ? (Sentry.wrap(component) as C) : component;
}

export { Sentry };
