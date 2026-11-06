import { Text } from 'react-native';

import { useThemeColors } from '@/theme';

import { splitMentions, type MentionMember } from './mentions';

/**
 * Renders a message body with @-mentions highlighted. `baseColor` lets a colored
 * (own) bubble override the default text color; a mention of the current user is
 * always tinted gold.
 */
export function MentionText({
  body,
  members,
  meId,
  baseColor,
  mentionColor,
}: {
  body: string;
  members: MentionMember[];
  meId?: string | null;
  baseColor?: string;
  mentionColor?: string;
}) {
  const c = useThemeColors();
  const base = baseColor ?? c.text;
  const mention = mentionColor ?? c.primary;
  const segments = splitMentions(body, members);
  return (
    <Text style={{ fontSize: 16, lineHeight: 21, color: base }}>
      {segments.map((seg, i) =>
        seg.member ? (
          <Text
            key={i}
            style={{ color: seg.member.id === meId ? c.captain : mention, fontWeight: '700' }}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
    </Text>
  );
}
