import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Browser tab titles (web only). Expo Router ships with
 * `documentTitle: { enabled: false }`, so per-screen `title` options drive the
 * native/web header bar but NEVER touch document.title — we set it ourselves.
 *
 * Native is a no-op. The static shell (app/+html.tsx) seeds <title>Starting XI</title>
 * for first paint; this swaps it per route after hydration.
 */
const BRAND = 'Starting XI';

// Path → page name. '/' is shared by sign-in, onboarding, and home (route groups
// add no path segment), so it stays the bare brand. Listed paths get "<page> · Starting XI".
const PAGE_BY_PATH: Record<string, string> = {
  '/verify': 'Sign in',
  '/roster': 'Build your XI',
  '/leaderboard': 'Leaderboard',
  '/chat': 'Chat',
  '/league': 'League',
  '/live': 'Live',
  '/picks': 'Tournament picks',
};

function titleFor(pathname: string): string {
  if (pathname.startsWith('/team/')) return `Team · ${BRAND}`;
  const page = PAGE_BY_PATH[pathname];
  return page ? `${page} · ${BRAND}` : BRAND;
}

export function useWebDocumentTitle(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = titleFor(pathname);
  }, [pathname]);
}
