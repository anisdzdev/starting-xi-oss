import { getSupabase } from '@/lib/supabase';

export type AnnouncementCoach = {
  id: number;
  imageUrl: string | null;
  code: string;
  flagUrl: string | null;
};

/** A handful of coaches (with their team flag) to decorate the announcement graphic.
 *  Best-effort — returns [] if the coaches table isn't populated yet. */
export async function loadAnnouncementCoaches(limit = 6): Promise<AnnouncementCoach[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('coaches')
    .select('id, image_url, team:teams(code, flag_url)')
    .not('image_url', 'is', null)
    .limit(limit);
  return (data ?? []).map((r) => {
    const team = (r as Record<string, any>).team;
    return {
      id: Number((r as Record<string, any>).id),
      imageUrl: (r as Record<string, any>).image_url ?? null,
      code: team?.code ?? '',
      flagUrl: team?.flag_url ?? null,
    };
  });
}

/**
 * Whether to show the Coach of the Day announcement to the signed-in user.
 * Decoupled from the auth-critical profile fetch on purpose: this is a non-critical
 * read, so if the column doesn't exist yet (migration not applied) or the query
 * errors, we return false — the popup simply never shows and login is unaffected.
 */
export async function shouldShowCoachAnnouncement(): Promise<boolean> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('seen_coach_announcement_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) return false; // column missing / error → never nag, never break
  return (data as { seen_coach_announcement_at: string | null }).seen_coach_announcement_at == null;
}

/** Mark the Coach of the Day announcement as seen for the signed-in user. */
export async function markCoachAnnouncementSeen(): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('profiles')
    .update({ seen_coach_announcement_at: new Date().toISOString() })
    .eq('id', user.id);
}
