-- Coach of the Day — daily pick of a team's manager. Scores from the team's subs,
-- the match result, and the coach's own bookings; points fold into daily_leaderboard.
-- Spec: docs/superpowers/specs/2026-06-19-coach-of-the-day-design.md

-- ---- reference data: one coach per team. id = FotMob coach id (= the player.id on
-- coach card events and the team endpoint's coach.id), so writes need no id mapping.
create table public.coaches (
  id bigint primary key,
  name text not null,
  team_id bigint not null references public.teams (id),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coaches_team_id_idx on public.coaches (team_id);

create trigger coaches_set_updated_at
  before update on public.coaches
  for each row execute function public.set_updated_at();

-- ---- daily pick (mirrors rosters: created_at/locked_at drive the lock trigger)
create table public.coach_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_day date not null,
  coach_id bigint not null references public.coaches (id),
  team_id bigint not null references public.teams (id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_day)
);

create trigger coach_picks_set_updated_at
  before update on public.coach_picks
  for each row execute function public.set_updated_at();

-- ---- new scoring inputs persisted by poll-live
alter table public.player_match_stats
  add column is_sub boolean not null default false;

alter table public.fixtures
  add column motm_player_id bigint; -- FotMob player id of the Man of the Match

create table public.coach_match_stats (
  coach_id bigint not null references public.coaches (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  team_id bigint not null references public.teams (id),
  yellows integer not null default 0,
  reds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (coach_id, fixture_id)
);
create index coach_match_stats_fixture_id_idx on public.coach_match_stats (fixture_id);

-- ---- RLS: league-readable; users write only their own coach pick
alter table public.coaches enable row level security;
alter table public.coach_picks enable row level security;
alter table public.coach_match_stats enable row level security;

create policy "read coaches" on public.coaches for select to authenticated using (true);
create policy "read coach_picks" on public.coach_picks for select to authenticated using (true);
create policy "read coach_match_stats" on public.coach_match_stats for select to authenticated using (true);

create policy "insert own coach_pick" on public.coach_picks
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own unlocked coach_pick" on public.coach_picks
  for update to authenticated
  using (user_id = auth.uid() and locked_at is null)
  with check (user_id = auth.uid());
create policy "delete own unlocked coach_pick" on public.coach_picks
  for delete to authenticated using (user_id = auth.uid() and locked_at is null);
-- coaches / coach_match_stats have NO user write policy: service role (ingest,
-- poll-live) bypasses RLS, the app only reads them.

-- ---- realtime: client hook reacts to card + pick changes
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='coach_picks') then
    alter publication supabase_realtime add table public.coach_picks;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='coach_match_stats') then
    alter publication supabase_realtime add table public.coach_match_stats;
  end if;
end $$;

-- ---- per-(user, game_day) coach points. Components exposed so the client breakdown
-- sheet renders line items without recomputing. Result + MOTM finalize at full time;
-- sub goals/assists + cards accrue live.
create view public.coach_day_points
with (security_invoker = true) as
with fx as (
  select cp.user_id, cp.game_day, cp.coach_id, cp.team_id,
         f.id as fixture_id, f.status, f.home_team, f.away_team,
         f.home_score, f.away_score, f.motm_player_id
  from public.coach_picks cp
  join public.fixtures f
    on f.game_day = cp.game_day
   and (f.home_team = cp.team_id or f.away_team = cp.team_id)
),
sub_contrib as (
  select fx.user_id, fx.game_day,
         sum(pms.goals) as sub_goals,
         sum(pms.assists) as sub_assists
  from fx
  join public.player_match_stats pms on pms.fixture_id = fx.fixture_id and pms.is_sub
  join public.players pl on pl.id = pms.player_id and pl.team_id = fx.team_id
  group by fx.user_id, fx.game_day
),
motm as (
  select distinct fx.user_id, fx.game_day
  from fx
  join public.players mp on mp.fotmob_id = fx.motm_player_id and mp.team_id = fx.team_id
  join public.player_match_stats pms
    on pms.fixture_id = fx.fixture_id and pms.player_id = mp.id and pms.is_sub
),
result as (
  select fx.user_id, fx.game_day,
    sum(case when fx.status = 'finished' then
      case
        when fx.home_team = fx.team_id and fx.home_score > fx.away_score then 5
        when fx.away_team = fx.team_id and fx.away_score > fx.home_score then 5
        when fx.home_score = fx.away_score then 0
        else -3
      end else 0 end) as result_pts
  from fx
  group by fx.user_id, fx.game_day
),
cards as (
  select fx.user_id, fx.game_day,
         sum(cms.yellows) as yellows, sum(cms.reds) as reds
  from fx
  join public.coach_match_stats cms
    on cms.fixture_id = fx.fixture_id and cms.coach_id = fx.coach_id
  group by fx.user_id, fx.game_day
)
select
  cp.user_id, cp.game_day, cp.coach_id, cp.team_id,
  (3 * coalesce(sc.sub_goals, 0))::integer as sub_goal_pts,
  (2 * coalesce(sc.sub_assists, 0))::integer as sub_assist_pts,
  (case when m.user_id is not null then 3 else 0 end)::integer as motm_pts,
  coalesce(rs.result_pts, 0)::integer as result_pts,
  (-1 * coalesce(cd.yellows, 0) - 3 * coalesce(cd.reds, 0))::integer as card_pts,
  (3 * coalesce(sc.sub_goals, 0)
    + 2 * coalesce(sc.sub_assists, 0)
    + case when m.user_id is not null then 3 else 0 end
    + coalesce(rs.result_pts, 0)
    - 1 * coalesce(cd.yellows, 0)
    - 3 * coalesce(cd.reds, 0))::integer as points
from public.coach_picks cp
left join sub_contrib sc on sc.user_id = cp.user_id and sc.game_day = cp.game_day
left join motm m on m.user_id = cp.user_id and m.game_day = cp.game_day
left join result rs on rs.user_id = cp.user_id and rs.game_day = cp.game_day
left join cards cd on cd.user_id = cp.user_id and cd.game_day = cp.game_day;

-- ---- fold coach points into the daily total. A user appears if they have a roster
-- OR a coach pick that day; their points are the sum of both. Columns + order match
-- the original view so `create or replace` keeps overall_leaderboard intact.
create or replace view public.daily_leaderboard
with (security_invoker = true) as
with roster_pts as (
  select r.game_day, r.user_id,
    coalesce(sum(pdp.points * case when rp.player_id = r.captain_player_id then 2 else 1 end), 0) as pts
  from public.rosters r
  left join public.roster_players rp on rp.roster_id = r.id
  left join public.player_day_points pdp
    on pdp.player_id = rp.player_id and pdp.game_day = r.game_day
  group by r.game_day, r.user_id
),
combined as (
  select game_day, user_id, pts from roster_pts
  union all
  select game_day, user_id, points as pts from public.coach_day_points
)
select
  c.game_day,
  c.user_id,
  p.display_name,
  p.avatar_url,
  sum(c.pts)::integer as points,
  rank() over (partition by c.game_day order by sum(c.pts) desc)::integer as rank
from combined c
join public.profiles p on p.id = c.user_id
group by c.game_day, c.user_id, p.display_name, p.avatar_url;
