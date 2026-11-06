import { Download, Share, SquarePlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * Web-only "Install app" affordance:
 *  - Chrome/Edge/Android: captures `beforeinstallprompt` and re-fires it on tap
 *  - iOS Safari: opens an Add-to-Home-Screen instructions sheet
 * Hidden when already installed (standalone) or when neither path applies.
 */
export function InstallPrompt() {
  const c = useThemeColors();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandalone()) return; // already installed
    setIosEligible(isIosSafari());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || installed || (!installEvent && !iosEligible)) return null;

  return (
    <>
      <Pressable
        onPress={async () => {
          if (installEvent) {
            await installEvent.prompt();
            const { outcome } = await installEvent.userChoice;
            if (outcome === 'accepted') setInstallEvent(null);
          } else {
            setShowIosSheet(true);
          }
        }}
        className="flex-row items-center gap-md rounded-xl border border-border bg-surface px-lg py-md active:opacity-80"
      >
        <Download size={18} color={c.accentCyan} strokeWidth={2.2} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-text">Install the app</Text>
          <Text className="text-xs text-textMuted">
            Home-screen icon, full screen, push notifications
          </Text>
        </View>
      </Pressable>

      <BottomSheet visible={showIosSheet} onClose={() => setShowIosSheet(false)}>
        <View className="gap-lg pb-lg">
          <Text className="text-lg font-semibold text-text">Add to Home Screen</Text>
          <View className="flex-row items-center gap-md">
            <Share size={20} color={c.accentBlue} strokeWidth={2} />
            <Text className="flex-1 text-sm text-textMuted">
              Tap the <Text className="font-semibold text-text">Share</Text> button in
              Safari&apos;s toolbar
            </Text>
          </View>
          <View className="flex-row items-center gap-md">
            <SquarePlus size={20} color={c.primary} strokeWidth={2} />
            <Text className="flex-1 text-sm text-textMuted">
              Choose <Text className="font-semibold text-text">Add to Home Screen</Text>, then{' '}
              <Text className="font-semibold text-text">Add</Text>
            </Text>
          </View>
          <Text className="text-xs text-textFaint">
            Open Starting XI from the new icon — notifications work from the installed app
            (iOS 16.4+).
          </Text>
          <Button title="Got it" variant="ghost" onPress={() => setShowIosSheet(false)} />
        </View>
      </BottomSheet>
    </>
  );
}
