-- User competitions: side bets over a span of rounds (a metric + a reward).
-- Anyone creates, everyone sees, anyone joins — but only BEFORE the span's first
-- kickoff (no joining with hindsight). Standings derive from points people already
-- earn (daily XI totals) or from one pick each member nominates.
-- See docs/superpowers/specs/2026-10-14-competitions-design.md.

-- ============================================================ tables

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id text not null references public.seasons (id),
  name text not null check (char_length(name) between 2 and 60),
  reward text check (reward is null or char_length(reward) <= 140),
  metric text not null check (metric in ('xi', 'pick')),
  pick_kind text check (pick_kind in ('keeper', 'player')),
  from_round text not null,                 -- round keys of season_rounds (md3, playoff, …)
  to_round text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((metric = 'pick') = (pick_kind is not null))
);
create index competitions_season_idx on public.competitions (season_id, created_at desc);

create table public.competition_members (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pick_player_id bigint references public.players (id),
  joined_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);
create index competition_members_user_idx on public.competition_members (user_id);

-- ============================================================ lock trigger

create or replace function public.enforce_competition_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_role text;
  v_comp public.competitions%rowtype;
  v_from date; v_to date; v_first timestamptz;
  v_pos text; v_pick_season text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'none');
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'competitions' then
    v_comp := coalesce(new, old);
    -- created_at is server-owned: a client-chosen future value would defeat
    -- send-push's "< 60 s old" replay check and pin the row to the top of the list.
    if tg_op = 'INSERT' then new.created_at := now(); v_comp.created_at := new.created_at; end if;
  else
    if tg_op = 'INSERT' then new.joined_at := now(); end if;
    -- a member row's identity is fixed: moving it to another competition would let a
    -- losing member escape a started competition into an open one (only the target
    -- gets lock-checked below).
    if tg_op = 'UPDATE' and (new.competition_id <> old.competition_id or new.user_id <> old.user_id) then
      raise exception 'Leave and rejoin instead of moving a membership' using errcode = 'P0001';
    end if;
    select * into v_comp from public.competitions
      where id = coalesce(new.competition_id, old.competition_id);
    if not found then
      -- A member DELETE whose competition is already gone is the ON DELETE CASCADE
      -- of a (lock-checked) competition delete — let it through. Anything else
      -- on a missing competition is an error (an INSERT would fail the FK anyway).
      if tg_op = 'DELETE' then return old; end if;
      raise exception 'Competition not found' using errcode = 'P0001';
    end if;
  end if;

  -- resolve the span from this season's rounds
  select r1.starts_on, r2.ends_on into v_from, v_to
  from public.season_rounds r1
  join public.season_rounds r2 on r2.season_id = r1.season_id
  where r1.season_id = v_comp.season_id and r1.round_key = v_comp.from_round
    and r2.round_key = v_comp.to_round;
  if v_from is null then
    raise exception 'Unknown rounds % → % for season %', v_comp.from_round, v_comp.to_round, v_comp.season_id
      using errcode = 'P0001';
  end if;
  -- rounds must be in order (spec: from.starts_on ≤ to.starts_on)
  if (select r1.starts_on > r2.starts_on
      from public.season_rounds r1, public.season_rounds r2
      where r1.season_id = v_comp.season_id and r1.round_key = v_comp.from_round
        and r2.season_id = v_comp.season_id and r2.round_key = v_comp.to_round) then
    raise exception 'The competition must end after it starts' using errcode = 'P0001';
  end if;

  select min(kickoff_utc) into v_first from public.fixtures
    where season_id = v_comp.season_id and game_day between v_from and v_to;
  if v_first is null or now() >= v_first then
    raise exception 'This competition has already started — joins, picks and deletions closed at %', v_first
      using errcode = 'P0001';
  end if;

  -- member picks must match the metric, the season and the position
  if tg_table_name = 'competition_members' and tg_op in ('INSERT', 'UPDATE') then
    if v_comp.metric = 'xi' then
      if new.pick_player_id is not null then
        raise exception 'This competition scores your XI — it has no pick' using errcode = 'P0001';
      end if;
    else
      if new.pick_player_id is null then
        raise exception 'Choose your % first', v_comp.pick_kind using errcode = 'P0001';
      end if;
      select position::text, season_id into v_pos, v_pick_season
        from public.players where id = new.pick_player_id;
      if v_pick_season is distinct from v_comp.season_id then
        raise exception 'That player is not registered for this season' using errcode = 'P0001';
      end if;
      if v_comp.pick_kind = 'keeper' and v_pos <> 'GK' then
        raise exception 'Pick a goalkeeper' using errcode = 'P0001';
      end if;
      if v_comp.pick_kind = 'player' and v_pos = 'GK' then
        raise exception 'Pick an outfield player' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger competitions_enforce_lock
  before insert or update or delete on public.competitions
  for each row execute function public.enforce_competition_lock();
create trigger competition_members_enforce_lock
  before insert or update or delete on public.competition_members
  for each row execute function public.enforce_competition_lock();

-- ============================================================ RLS

alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;

create policy "read competitions" on public.competitions for select to authenticated using (true);
create policy "create own competition" on public.competitions
  for insert to authenticated with check (created_by = auth.uid());
create policy "delete own competition" on public.competitions
  for delete to authenticated using (created_by = auth.uid());
-- no UPDATE policy: delete + recreate instead

create policy "read competition members" on public.competition_members for select to authenticated using (true);
create policy "join as self" on public.competition_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "change own pick" on public.competition_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave as self" on public.competition_members
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================ views

-- Per competition: date span, first/last kickoff and a derived status.
create or replace view public.competition_spans
with (security_invoker = true) as
with span as (
  select c.id, c.season_id, r1.starts_on, r2.ends_on
  from public.competitions c
  join public.season_rounds r1 on r1.season_id = c.season_id and r1.round_key = c.from_round
  join public.season_rounds r2 on r2.season_id = c.season_id and r2.round_key = c.to_round
),
fx as (
  select s.id,
         min(f.kickoff_utc) as first_kickoff,
         max(f.kickoff_utc) as last_kickoff,
         count(f.id)::integer as fixtures,
         bool_and(f.status in ('finished', 'postponed', 'cancelled')) as all_done
  from span s
  left join public.fixtures f
    on f.season_id = s.season_id and f.game_day between s.starts_on and s.ends_on
  group by s.id
)
select
  s.id,
  s.season_id,
  s.starts_on,
  s.ends_on,
  fx.first_kickoff,
  fx.last_kickoff,
  fx.fixtures,
  case
    when fx.first_kickoff is null or now() < fx.first_kickoff then 'open'
    when fx.all_done then 'finished'
    else 'live'
  end as status
from span s
join fx on fx.id = s.id;

-- Per competition/member: points by metric, rank per competition. Every member is
-- listed (0 until something is played) so a competition always shows who's in.
create or replace view public.competition_standings
with (security_invoker = true) as
-- The rounds IN the span = every round whose start lies between the from/to rounds'
-- starts. Points come from those rounds' own fixtures/days only, so a postponed match
-- that stretches a round's date range never drags another matchday's days in.
with span_rounds as (
  select c.id as competition_id, c.season_id, c.metric, r.round_key
  from public.competitions c
  join public.season_rounds r1 on r1.season_id = c.season_id and r1.round_key = c.from_round
  join public.season_rounds r2 on r2.season_id = c.season_id and r2.round_key = c.to_round
  join public.season_rounds r on r.season_id = c.season_id
    and r.starts_on between r1.starts_on and r2.starts_on
),
span_fixtures as (
  select sr.competition_id, sr.metric, f.id as fixture_id, f.game_day
  from span_rounds sr
  join public.fixtures f on f.season_id = sr.season_id and f.round_key = sr.round_key
),
span_days as (
  select distinct competition_id, game_day from span_fixtures where metric = 'xi'
),
xi as (
  select m.competition_id, m.user_id,
         coalesce(sum(d.points), 0)::integer as points,
         count(d.game_day)::integer as played
  from public.competition_members m
  join public.competitions c on c.id = m.competition_id and c.metric = 'xi'
  left join span_days sd on sd.competition_id = m.competition_id
  left join public.daily_leaderboard d on d.user_id = m.user_id and d.game_day = sd.game_day
  group by m.competition_id, m.user_id
),
pick as (
  select m.competition_id, m.user_id,
         coalesce(sum(pms.fpl_points), 0)::integer as points,
         count(pms.fixture_id)::integer as played
  from public.competition_members m
  join public.competitions c on c.id = m.competition_id and c.metric = 'pick'
  left join span_fixtures sf on sf.competition_id = m.competition_id
  left join public.player_match_stats pms
    on pms.player_id = m.pick_player_id and pms.fixture_id = sf.fixture_id
  group by m.competition_id, m.user_id
),
scored as (
  select * from xi union all select * from pick
)
select
  sc.competition_id,
  sc.user_id,
  p.display_name,
  p.avatar_url,
  m.pick_player_id,
  pl.name as pick_name,
  pl.image_url as pick_image_url,
  sc.points,
  sc.played,
  rank() over (partition by sc.competition_id order by sc.points desc)::integer as rank
from scored sc
join public.competition_members m on m.competition_id = sc.competition_id and m.user_id = sc.user_id
join public.profiles p on p.id = sc.user_id
left join public.players pl on pl.id = m.pick_player_id;
