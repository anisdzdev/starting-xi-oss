import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AlertTriangle, ClipboardList, Sparkles, Trophy, User } from 'lucide-react-native';

import { BottomSheet, Button, FlagBadge } from '@/components';
import { useSession } from '@/features/auth/session-context';
import { colors, gradients, radii, spacing } from '@/theme';
import {
  loadAnnouncementCoaches,
  markCoachAnnouncementSeen,
  shouldShowCoachAnnouncement,
  type AnnouncementCoach,
} from './api';

const HIGHLIGHTS: { icon: typeof Sparkles; text: string }[] = [
  { icon: Sparkles, text: 'Your subs earn you points — goals +3, assists +2, Man of the Match +3' },
  { icon: Trophy, text: 'The result counts too: win +5, draw 0, loss −3' },
  { icon: AlertTriangle, text: "Even the coach's own cards count — yellow −1, red −3" },
];

/** Placeholder cluster when no real coaches are loaded yet. */
const PLACEHOLDERS: AnnouncementCoach[] = Array.from({ length: 4 }, (_, i) => ({
  id: -i - 1,
  imageUrl: null,
  code: '',
  flagUrl: null,
}));

function CoachCluster({ coaches }: { coaches: AnnouncementCoach[] }) {
  const list = (coaches.length >= 2 ? coaches : PLACEHOLDERS).slice(0, 5);
  const SIZE = 60;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      {list.map((co, i) => (
        <View key={co.id} style={{ marginLeft: i === 0 ? 0 : -18, zIndex: list.length - i }}>
          <View
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              borderWidth: 3,
              borderColor: colors.bg,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {co.imageUrl ? (
              <Image source={{ uri: co.imageUrl }} style={{ width: SIZE, height: SIZE }} />
            ) : (
              <User size={26} color={colors.textMuted} />
            )}
          </View>
          {co.flagUrl || co.code ? (
            <View style={{ position: 'absolute', right: -2, bottom: -2 }}>
              <FlagBadge uri={co.flagUrl} code={co.code} variant="round" size={20} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * One-time "Coach of the Day is here" announcement. Shows once to any onboarded user
 * whose `profiles.seen_coach_announcement_at` is null (new signups are stamped at
 * creation, so only existing players see it), then marks it seen server-side so it
 * never reappears — across devices. Mounted in the authed (app) layout.
 */
export function CoachAnnouncement() {
  const { profile } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [coaches, setCoaches] = useState<AnnouncementCoach[]>([]);

  // Decoupled from the auth profile fetch: only resolve once a profile is loaded
  // (user is signed in + onboarded). A missing column / error → not eligible.
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    shouldShowCoachAnnouncement().then((ok) => {
      if (alive) setEligible(ok);
    });
    return () => {
      alive = false;
    };
  }, [profile]);

  const show = eligible && !dismissed;

  useEffect(() => {
    if (!show) return;
    let alive = true;
    loadAnnouncementCoaches().then((c) => {
      if (alive) setCoaches(c);
    });
    return () => {
      alive = false;
    };
  }, [show]);

  async function close(goToRoster: boolean) {
    setDismissed(true); // hide immediately
    if (goToRoster) router.push('/roster');
    try {
      await markCoachAnnouncementSeen();
    } catch {
      // best-effort; local `dismissed` keeps it hidden this session regardless
    }
  }

  return (
    <BottomSheet visible={show} onClose={() => close(false)}>
      <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
        {/* hero */}
        <LinearGradient
          colors={gradients.gold as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radii.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
            paddingHorizontal: spacing.lg,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                backgroundColor: colors.bg,
                borderRadius: 999,
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
              }}
            >
              <ClipboardList size={13} color={colors.captain} strokeWidth={2.4} />
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
                NEW
              </Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.lg }}>
            <CoachCluster coaches={coaches} />
          </View>
        </LinearGradient>

        {/* copy */}
        <View style={{ gap: spacing.xs }}>
          <Text className="text-2xl font-bold text-text">Coach of the Day is here</Text>
          <Text className="text-sm text-textMuted">
            Every matchday you now pick a coach alongside your XI. Be the smartest manager in
            the league — points come from the moves a coach actually controls.
          </Text>
        </View>

        {/* highlights */}
        <View style={{ gap: spacing.md }}>
          {HIGHLIGHTS.map((h) => (
            <View key={h.text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <h.icon size={17} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text className="flex-1 text-sm text-text">{h.text}</Text>
            </View>
          ))}
        </View>

        {/* actions */}
        <View style={{ gap: spacing.sm }}>
          <Button title="Pick your coach" onPress={() => close(true)} />
          <Pressable
            onPress={() => close(false)}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: 'center', paddingVertical: spacing.sm })}
          >
            <Text className="text-sm font-medium text-textMuted">Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
