import { getSupabase } from '@/lib/supabase';

import type {
  Competition,
  CompetitionStanding,
  CompetitionStatus,
  NewCompetition,
} from './types';

const COMPETITION_SELECT =
  'id, season_id, name, reward, metric, pick_kind, from_round, to_round, created_by, created_at, ' +
  'creator:profiles!competitions_created_by_fkey(display_name), ' +
  'members:competition_members(user_id, pick_player_id)';

type CompetitionRow = {
  id: string;
  season_id: string;
  name: string;
  reward: string | null;
  metric: 'xi' | 'pick';
  pick_kind: 'keeper' | 'player' | null;
  from_round: string;
  to_round: string;
  created_by: string;
  created_at: string;
  creator: { display_name: string } | null;
  members: { user_id: string; pick_player_id: number | null }[];
};

type SpanRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  first_kickoff: string | null;
  status: CompetitionStatus;
};

function toCompetition(row: CompetitionRow, span: SpanRow | undefined, meId: string | null): Competition {
  const mine = row.members.find((m) => m.user_id === meId);
  return {
    id: row.id,
    seasonId: row.season_id,
    name: row.name,
    reward: row.reward,
    metric: row.metric,
    pickKind: row.pick_kind,
    fromRound: row.from_round,
    toRound: row.to_round,
    createdBy: row.created_by,
    creatorName: row.creator?.display_name ?? 'Someone',
    createdAt: row.created_at,
    startsOn: span?.starts_on ?? '',
    endsOn: span?.ends_on ?? '',
    firstKickoff: span?.first_kickoff ?? null,
    status: span?.status ?? 'open',
    memberCount: row.members.length,
    me: { joined: !!mine, pickPlayerId: mine?.pick_player_id ?? null },
  };
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  return user?.id ?? null;
}

/** Every competition of a season (newest first) with its span, member count and my membership. */
export async function loadCompetitions(seasonId: string): Promise<Competition[]> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  const [{ data: rows, error }, { data: spans }] = await Promise.all([
    supabase
      .from('competitions')
      .select(COMPETITION_SELECT)
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false }),
    supabase
      .from('competition_spans')
      .select('id, starts_on, ends_on, first_kickoff, status')
      .eq('season_id', seasonId),
  ]);
  if (error) throw new Error(error.message);
  const spanById = new Map(((spans ?? []) as SpanRow[]).map((s) => [s.id, s]));
  return ((rows ?? []) as unknown as CompetitionRow[]).map((r) =>
    toCompetition(r, spanById.get(r.id), meId)
  );
}

/** One competition + its standings (every member, 0 until something is played). */
export async function loadCompetition(
  id: string
): Promise<{ competition: Competition; standings: CompetitionStanding[] } | null> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  const [{ data: row }, { data: span }, { data: standings }] = await Promise.all([
    supabase.from('competitions').select(COMPETITION_SELECT).eq('id', id).maybeSingle(),
    supabase
      .from('competition_spans')
      .select('id, starts_on, ends_on, first_kickoff, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('competition_standings').select('*').eq('competition_id', id).order('rank'),
  ]);
  if (!row) return null;
  return {
    competition: toCompetition(row as unknown as CompetitionRow, (span as SpanRow | null) ?? undefined, meId),
    standings: (standings ?? []).map((s) => ({
      userId: s.user_id as string,
      name: s.display_name as string,
      avatarUrl: (s.avatar_url as string | null) ?? null,
      pickPlayerId: (s.pick_player_id as number | null) ?? null,
      pickName: (s.pick_name as string | null) ?? null,
      pickImageUrl: (s.pick_image_url as string | null) ?? null,
      points: Number(s.points),
      played: Number(s.played),
      rank: Number(s.rank),
    })),
  };
}

/**
 * Create a competition (the creator joins separately, like everyone else) and
 * ask send-push to tell the league — best-effort, the row already exists.
 */
export async function createCompetition(input: NewCompetition): Promise<string> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  if (!meId) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('competitions')
    .insert({
      season_id: input.seasonId,
      name: input.name.trim(),
      reward: input.reward?.trim() || null,
      metric: input.metric,
      pick_kind: input.metric === 'pick' ? input.pickKind : null,
      from_round: input.fromRound,
      to_round: input.toRound,
      created_by: meId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  // fire-and-forget: the row exists; don't hold "Creating…" for the function round trip
  void supabase.functions
    .invoke('send-push', { body: { kind: 'competition', competition_id: id } })
    .catch(() => undefined);
  return id;
}

/** Join (pick required for 'pick' competitions; the server trigger validates it). */
export async function joinCompetition(id: string, pickPlayerId: number | null): Promise<void> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  if (!meId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('competition_members')
    .insert({ competition_id: id, user_id: meId, pick_player_id: pickPlayerId });
  if (error) throw new Error(error.message);
}

export async function setPick(id: string, pickPlayerId: number): Promise<void> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  if (!meId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('competition_members')
    .update({ pick_player_id: pickPlayerId })
    .eq('competition_id', id)
    .eq('user_id', meId);
  if (error) throw new Error(error.message);
}

export async function leaveCompetition(id: string): Promise<void> {
  const supabase = getSupabase();
  const meId = await currentUserId();
  if (!meId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('competition_members')
    .delete()
    .eq('competition_id', id)
    .eq('user_id', meId);
  if (error) throw new Error(error.message);
}

/** Creator only (RLS); the trigger rejects it once the competition has started. */
export async function deleteCompetition(id: string): Promise<void> {
  const { error } = await getSupabase().from('competitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
