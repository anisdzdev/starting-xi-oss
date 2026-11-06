import { Bell, BellOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';

import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  webPushSupported,
  type WebPushStatus,
} from '@/lib/webpush';
import { useThemeColors } from '@/theme';

/**
 * Web-only settings row: match notifications via Web Push. Permission prompt
 * fires only when the user flips the toggle on.
 */
export function WebPushToggle() {
  const c = useThemeColors();
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    getWebPushStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS !== 'web' || !webPushSupported() || status === null) return null;

  const subscribed = status === 'subscribed';
  const denied = status === 'denied';

  const toggle = async () => {
    setBusy(true);
    setStatus(subscribed ? await disableWebPush() : await enableWebPush());
    setBusy(false);
  };

  return (
    <Pressable
      onPress={denied || busy ? undefined : toggle}
      className="flex-row items-center gap-md rounded-xl border border-border bg-surface px-lg py-md"
    >
      {subscribed ? (
        <Bell size={18} color={c.primary} strokeWidth={2.2} />
      ) : (
        <BellOff size={18} color={c.textFaint} strokeWidth={2.2} />
      )}
      <View className="flex-1">
        <Text className="text-base font-semibold text-text">Match notifications</Text>
        <Text className="text-xs text-textMuted">
          {denied
            ? 'Blocked in browser settings — enable notifications for this site'
            : 'Nudges, lineup reminders and lock alerts'}
        </Text>
      </View>
      <Switch
        value={subscribed}
        onValueChange={denied || busy ? undefined : toggle}
        disabled={denied || busy}
        trackColor={{ true: c.primary, false: c.border }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}
