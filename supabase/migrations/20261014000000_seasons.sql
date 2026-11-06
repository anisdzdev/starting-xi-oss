-- Seasons: a competition dimension (World Cup archived, Champions League active).
--
-- Game days never overlap between seasons, so everything game-day keyed (rosters,
-- roster_players, coach_picks, daily/coach views, chat, nudges) stays exactly as
-- it is. Only fixtures / players / tournament_picks carry a season_id — the
-- places where identity would otherwise collide (the same FotMob player id is a
-- France player in wc2026 and a Real Madrid player in ucl2026).
-- See docs/superpowers/specs/2026-10-14-seasons-foundation-design.md.

-- ============================================================ seasons

create table public.seasons (
  id text primary key,                     -- 'wc2026', 'ucl2026'
  name text not null,                      -- "Champions League 2026/27"
  short_name text not null,                -- "UCL 26/27" (switcher chip)
  kind text not null check (kind in ('nation', 'club')),
  fotmob_league_id integer not null,       -- 77 = World Cup, 42 = Champions League
  starts_on date not null,                 -- inclusive game-day range
  ends_on date not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'active', 'archived')),
  has_tournament_picks boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- at most one active season
create unique index seasons_one_active_idx on public.seasons ((true)) where status = 'active';

alter table public.seasons enable row level security;
create policy "read seasons" on public.seasons for select to authenticated using (true);
-- no user write policies: service role / SQL only

insert into public.seasons
  (id, name, short_name, kind, fotmob_league_id, starts_on, ends_on, status, has_tournament_picks)
values
  ('wc2026',  'World Cup 2026',           'WC 2026',   'nation', 77, '2026-06-11', '2026-07-19', 'archived', true),
  -- UCL final date not known yet; generous end, tighten later (no overlap risk).
  ('ucl2026', 'Champions League 2026/27', 'UCL 26/27', 'club',   42, '2026-09-08', '2027-06-30', 'active',   false);

-- The season whose date range contains a game day (null in the gaps).
create or replace function public.season_of_day(d date)
returns text
language sql
stable
as $$
  select id from public.seasons
  where d between starts_on and ends_on
  order by starts_on desc
  limit 1
$$;

-- ============================================================ fixtures

alter table public.fixtures add column season_id text references public.seasons (id);
update public.fixtures set season_id = 'wc2026' where season_id is null;
alter table public.fixtures alter column season_id set not null;
create index fixtures_season_game_day_idx on public.fixtures (season_id, game_day);

-- Champions League stages: 'league' (league phase) and 'playoff' (knockout play-off).
alter table public.fixtures drop constraint fixtures_stage_check;
alter table public.fixtures add constraint fixtures_stage_check
  check (stage in ('group', 'league', 'playoff', 'r32', 'r16', 'qf', 'sf', 'third', 'final'));

-- ============================================================ players
-- A row = one person's registration in one season. Existing rosters, stats and
-- scout cards keep their player ids; a club season gets fresh rows.

alter table public.players add column season_id text references public.seasons (id);
update public.players set season_id = 'wc2026' where season_id is null;
alter table public.players alter column season_id set not null;
alter table public.players drop constraint players_fotmob_id_key;
alter table public.players add constraint players_fotmob_id_season_id_key unique (fotmob_id, season_id);
create index players_season_id_idx on public.players (season_id);

-- ============================================================ tournament_picks
-- Per season now (WC picks stay under wc2026; a later season may add its own).

alter table public.tournament_picks
  add column season_id text not null default 'wc2026' references public.seasons (id);
alter table public.tournament_picks drop constraint tournament_picks_pkey;
alter table public.tournament_picks add primary key (user_id, season_id);

-- ============================================================ views
-- overall_leaderboard: per SEASON (game day bucketed by the season's date range).
-- Dropped + recreated because the column list changes.

drop view if exists public.overall_leaderboard;
create view public.overall_leaderboard
with (security_invoker = true) as
select
  s.id as season_id,
  d.user_id,
  d.display_name,
  d.avatar_url,
  sum(d.points)::integer as points,
  count(*)::integer as days_played,
  rank() over (partition by s.id order by sum(d.points) desc)::integer as rank
from public.daily_leaderboard d
join public.seasons s on d.game_day between s.starts_on and s.ends_on
group by s.id, d.user_id, d.display_name, d.avatar_url;

-- Team-pick scoring now counts only the pick's season's fixtures ('league'
-- scores like 'group': 3/1 for a win/draw).
drop view if exists public.team_pick_leaderboard;
drop function if exists public.team_pick_points(bigint);
create function public.team_pick_points(p_team_id bigint, p_season_id text)
returns integer
language sql
stable
as $$
  with mine as (
    select f.stage, f.status,
      case when f.home_team = p_team_id then f.home_score else f.away_score end as gf,
      case when f.home_team = p_team_id then f.away_score else f.home_score end as ga
    from public.fixtures f
    where f.season_id = p_season_id
      and (f.home_team = p_team_id or f.away_team = p_team_id)
  ),
  match_pts as (
    select coalesce(sum(case
      when status <> 'finished' then 0
      when stage in ('group', 'league') and gf > ga then 3
      when stage in ('group', 'league') and gf = ga then 1
      when stage not in ('group', 'league') and gf > ga then 5
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

create view public.team_pick_leaderboard
with (security_invoker = true) as
select
  tp.season_id,
  tp.user_id,
  p.display_name,
  tp.team_id,
  t.name as team_name,
  t.flag_url,
  (select count(*)::integer from public.fixtures f
    where f.season_id = tp.season_id and f.status = 'finished'
      and (f.home_team = t.id or f.away_team = t.id)) as played,
  public.team_pick_points(t.id, tp.season_id) as points,
  rank() over (partition by tp.season_id
               order by public.team_pick_points(t.id, tp.season_id) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.teams t on t.id = tp.team_id
where tp.team_id is not null;

drop view if exists public.player_pick_leaderboard;
create view public.player_pick_leaderboard
with (security_invoker = true) as
select
  tp.season_id,
  tp.user_id,
  p.display_name,
  tp.player_id,
  pl.name as player_name,
  pl.image_url,
  coalesce(sum(pms.fpl_points), 0)::integer as points,
  rank() over (partition by tp.season_id
               order by coalesce(sum(pms.fpl_points), 0) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.players pl on pl.id = tp.player_id
left join public.player_match_stats pms on pms.player_id = tp.player_id
where tp.player_id is not null
group by tp.season_id, tp.user_id, p.display_name, tp.player_id, pl.name, pl.image_url;

drop view if exists public.keeper_pick_leaderboard;
create view public.keeper_pick_leaderboard
with (security_invoker = true) as
select
  tp.season_id,
  tp.user_id,
  p.display_name,
  tp.keeper_id,
  pl.name as keeper_name,
  pl.image_url,
  coalesce(sum(pms.fpl_points), 0)::integer as points,
  rank() over (partition by tp.season_id
               order by coalesce(sum(pms.fpl_points), 0) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.players pl on pl.id = tp.keeper_id
left join public.player_match_stats pms on pms.player_id = tp.keeper_id
where tp.keeper_id is not null
group by tp.season_id, tp.user_id, p.display_name, tp.keeper_id, pl.name, pl.image_url;
