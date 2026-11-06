-- Tournament picks: stage-aware team scoring + permanent lock at the opening match.

-- 1) Fixtures learn their tournament stage (ingest-fotmob populates it; everything
--    stored so far is group stage, so the default backfills correctly).
alter table public.fixtures
  add column if not exists stage text not null default 'group'
  check (stage in ('group', 'r32', 'r16', 'qf', 'sf', 'third', 'final'));

-- 2) Team-pick scoring:
--    group win +3, group draw +1, knockout win +5 (per match),
--    stage bonuses: reaching R16 +5, QF +8, SF +12, winning the final +20.
--    KO games decided on penalties read as draws in our score columns (no pens
--    stored) — they earn no win points until that limitation is addressed.
create or replace function public.team_pick_points(p_team_id bigint)
returns integer
language sql
stable
as $$
  with mine as (
    select f.stage, f.status,
      case when f.home_team = p_team_id then f.home_score else f.away_score end as gf,
      case when f.home_team = p_team_id then f.away_score else f.home_score end as ga
    from public.fixtures f
    where f.home_team = p_team_id or f.away_team = p_team_id
  ),
  match_pts as (
    select coalesce(sum(case
      when status <> 'finished' then 0
      when stage = 'group' and gf > ga then 3
      when stage = 'group' and gf = ga then 1
      when stage <> 'group' and gf > ga then 5
      else 0
    end), 0)::integer as pts
    from mine
  ),
  stage_bonus as (
    select
      (case when exists (select 1 from mine where stage = 'r16') then 5 else 0 end)
      + (case when exists (select 1 from mine where stage = 'qf') then 8 else 0 end)
      + (case when exists (select 1 from mine where stage = 'sf') then 12 else 0 end)
      + (case when exists (
          select 1 from mine where stage = 'final' and status = 'finished' and gf > ga
        ) then 20 else 0 end) as pts
  )
  select (select pts from match_pts) + (select pts from stage_bonus);
$$;

-- 3) team_pick_leaderboard now scores through the function.
create or replace view public.team_pick_leaderboard
with (security_invoker = true) as
select
  tp.user_id,
  p.display_name,
  tp.team_id,
  t.name as team_name,
  t.flag_url,
  (select count(*)::integer from public.fixtures f
    where f.status = 'finished' and (f.home_team = t.id or f.away_team = t.id)) as played,
  public.team_pick_points(t.id) as points,
  rank() over (order by public.team_pick_points(t.id) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.teams t on t.id = tp.team_id
where tp.team_id is not null;

-- 4) Permanent lock: user writes to tournament_picks rejected once the OPENING
--    match (earliest kickoff in the tournament) has started. Service role and
--    direct connections exempt, mirroring enforce_roster_lock.
create or replace function public.enforce_tournament_picks_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_first timestamptz;
  v_role text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'none'
  );
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  select min(kickoff_utc) into v_first from public.fixtures;
  if v_first is not null and now() >= v_first then
    raise exception 'Tournament picks are locked — the opening match kicked off at %', v_first
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tournament_picks_enforce_lock on public.tournament_picks;
create trigger tournament_picks_enforce_lock
  before insert or update or delete on public.tournament_picks
  for each row execute function public.enforce_tournament_picks_lock();
