-- daily-xi initial schema
-- Friends-only daily fantasy app: everyone (authenticated) can read everything;
-- users can only write their own profile, rosters, picks and nudges.
-- Reference data (teams, players, fixtures, stats, scout cards) is written by
-- the service role only (ingest jobs) — no write policies for users.

-- ============================================================ enums

create type public.player_position as enum ('GK', 'DEF', 'MID', 'FWD');

-- ============================================================ helpers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================ profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  expo_push_token text,
  web_push_subscription jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile on signup (display_name falls back to email prefix).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ reference data

create table public.teams (
  id bigint generated always as identity primary key,
  fotmob_id bigint not null unique,
  name text not null,
  code text not null, -- 3-letter country code, e.g. 'ARG'
  flag_url text
);

create table public.players (
  id bigint generated always as identity primary key,
  fotmob_id bigint not null unique,
  team_id bigint not null references public.teams (id) on delete cascade,
  name text not null,
  position public.player_position not null,
  image_url text,
  club text
);

create index players_team_id_idx on public.players (team_id);

create table public.fixtures (
  id bigint generated always as identity primary key,
  fotmob_id bigint not null unique,
  game_day date not null,
  kickoff_utc timestamptz not null,
  home_team bigint not null references public.teams (id),
  away_team bigint not null references public.teams (id),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score integer,
  away_score integer
);

create index fixtures_game_day_idx on public.fixtures (game_day);

-- ============================================================ formations

create table public.formations (
  code text primary key, -- e.g. '4-4-2'
  gk smallint not null default 1,
  def smallint not null,
  mid smallint not null,
  fwd smallint not null,
  check (gk + def + mid + fwd = 11)
);

insert into public.formations (code, gk, def, mid, fwd) values
  ('3-4-3', 1, 3, 4, 3),
  ('3-5-2', 1, 3, 5, 2),
  ('4-3-3', 1, 4, 3, 3),
  ('4-4-2', 1, 4, 4, 2),
  ('4-5-1', 1, 4, 5, 1),
  ('5-2-3', 1, 5, 2, 3),
  ('5-3-2', 1, 5, 3, 2),
  ('5-4-1', 1, 5, 4, 1);

-- ============================================================ rosters

create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_day date not null,
  formation_code text not null references public.formations (code),
  captain_player_id bigint references public.players (id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_day)
);

create trigger rosters_set_updated_at
  before update on public.rosters
  for each row execute function public.set_updated_at();

create table public.roster_players (
  roster_id uuid not null references public.rosters (id) on delete cascade,
  player_id bigint not null references public.players (id),
  slot_position smallint not null check (slot_position between 1 and 11),
  primary key (roster_id, player_id),
  unique (roster_id, slot_position)
);

create index roster_players_player_id_idx on public.roster_players (player_id);

-- ============================================================ stats

create table public.player_match_stats (
  player_id bigint not null references public.players (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  minutes integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  clean_sheet boolean not null default false,
  saves integer not null default 0,
  pen_saves integer not null default 0,
  pen_misses integer not null default 0,
  yellows integer not null default 0,
  reds integer not null default 0,
  own_goals integer not null default 0,
  goals_conceded integer not null default 0,
  rating numeric(4, 2),
  bonus integer not null default 0,
  -- Final per-match fantasy points, computed by the ingest job from the raw
  -- stats above. All leaderboards aggregate this column.
  fpl_points integer not null default 0,
  primary key (player_id, fixture_id)
);

create index player_match_stats_fixture_id_idx on public.player_match_stats (fixture_id);

-- ============================================================ tournament picks

-- One row per user: pre-tournament picks (a team, an outfield player, a keeper).
create table public.tournament_picks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  team_id bigint references public.teams (id),
  player_id bigint references public.players (id),
  keeper_id bigint references public.players (id),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tournament_picks_set_updated_at
  before update on public.tournament_picks
  for each row execute function public.set_updated_at();

-- ============================================================ nudges

create table public.nudges (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  game_day date not null,
  created_at timestamptz not null default now(),
  -- one nudge per friend per game day
  unique (from_user, to_user, game_day),
  check (from_user <> to_user)
);

create index nudges_to_user_idx on public.nudges (to_user, game_day);

-- ============================================================ scout cards

create table public.scout_cards (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players (id) on delete cascade,
  game_day date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (player_id, game_day)
);

create index scout_cards_game_day_idx on public.scout_cards (game_day);

-- ============================================================ row level security
-- Friends-only app: any authenticated user can READ everything.
-- Writes: only your own profile / rosters / picks / nudges.
-- Reference + stats tables have no user write policies (service role only).

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.fixtures enable row level security;
alter table public.formations enable row level security;
alter table public.rosters enable row level security;
alter table public.roster_players enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.tournament_picks enable row level security;
alter table public.nudges enable row level security;
alter table public.scout_cards enable row level security;

-- read everything
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "read teams" on public.teams for select to authenticated using (true);
create policy "read players" on public.players for select to authenticated using (true);
create policy "read fixtures" on public.fixtures for select to authenticated using (true);
create policy "read formations" on public.formations for select to authenticated using (true);
create policy "read rosters" on public.rosters for select to authenticated using (true);
create policy "read roster_players" on public.roster_players for select to authenticated using (true);
create policy "read player_match_stats" on public.player_match_stats for select to authenticated using (true);
create policy "read tournament_picks" on public.tournament_picks for select to authenticated using (true);
create policy "read nudges" on public.nudges for select to authenticated using (true);
create policy "read scout_cards" on public.scout_cards for select to authenticated using (true);

-- profiles: write your own (insert covered by signup trigger, kept for safety)
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- rosters: write your own, only while unlocked
create policy "insert own roster" on public.rosters
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own unlocked roster" on public.rosters
  for update to authenticated
  using (user_id = auth.uid() and locked_at is null)
  with check (user_id = auth.uid());
create policy "delete own unlocked roster" on public.rosters
  for delete to authenticated using (user_id = auth.uid() and locked_at is null);

-- roster_players: write rows of your own unlocked rosters
create policy "write own roster_players" on public.roster_players
  for all to authenticated
  using (
    exists (
      select 1 from public.rosters r
      where r.id = roster_id and r.user_id = auth.uid() and r.locked_at is null
    )
  )
  with check (
    exists (
      select 1 from public.rosters r
      where r.id = roster_id and r.user_id = auth.uid() and r.locked_at is null
    )
  );

-- tournament picks: write your own, only while unlocked
create policy "insert own picks" on public.tournament_picks
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own unlocked picks" on public.tournament_picks
  for update to authenticated
  using (user_id = auth.uid() and not locked)
  with check (user_id = auth.uid());

-- nudges: send as yourself (no update/delete)
create policy "send nudges" on public.nudges
  for insert to authenticated with check (from_user = auth.uid());

-- ============================================================ leaderboard views
-- All views use security_invoker so RLS applies to the querying user.
-- Scoring:
--   * roster points  = sum of fpl_points for the roster's players in fixtures
--                      on that game day; captain counts double
--   * team pick      = over finished fixtures: 3 per win, 1 per draw,
--                      + goal difference (goals scored - conceded, all matches)
--   * player/keeper pick = total fpl_points of the picked player

-- Per-player points per game day (includes live fixtures so boards tick up in-play).
create view public.player_day_points
with (security_invoker = true) as
select
  pms.player_id,
  f.game_day,
  sum(pms.fpl_points) as points
from public.player_match_stats pms
join public.fixtures f on f.id = pms.fixture_id
group by pms.player_id, f.game_day;

create view public.daily_leaderboard
with (security_invoker = true) as
select
  r.game_day,
  r.user_id,
  p.display_name,
  p.avatar_url,
  coalesce(
    sum(
      pdp.points
      * case when rp.player_id = r.captain_player_id then 2 else 1 end
    ),
    0
  )::integer as points,
  rank() over (
    partition by r.game_day
    order by coalesce(
      sum(pdp.points * case when rp.player_id = r.captain_player_id then 2 else 1 end),
      0
    ) desc
  )::integer as rank
from public.rosters r
join public.profiles p on p.id = r.user_id
left join public.roster_players rp on rp.roster_id = r.id
left join public.player_day_points pdp
  on pdp.player_id = rp.player_id and pdp.game_day = r.game_day
group by r.game_day, r.user_id, p.display_name, p.avatar_url;

create view public.overall_leaderboard
with (security_invoker = true) as
select
  user_id,
  display_name,
  avatar_url,
  sum(points)::integer as points,
  count(*)::integer as days_played,
  rank() over (order by sum(points) desc)::integer as rank
from public.daily_leaderboard
group by user_id, display_name, avatar_url;

-- 3 per win, 1 per draw, + goal difference over all finished fixtures.
create view public.team_pick_leaderboard
with (security_invoker = true) as
with team_results as (
  select
    t.id as team_id,
    count(f.id)::integer as played,
    coalesce(
      sum(
        case
          when (f.home_team = t.id and f.home_score > f.away_score)
            or (f.away_team = t.id and f.away_score > f.home_score) then 3
          when f.home_score = f.away_score then 1
          else 0
        end
        + case
            when f.home_team = t.id then f.home_score - f.away_score
            else f.away_score - f.home_score
          end
      ),
      0
    )::integer as points
  from public.teams t
  left join public.fixtures f
    on (f.home_team = t.id or f.away_team = t.id)
   and f.status = 'finished'
  group by t.id
)
select
  tp.user_id,
  p.display_name,
  tp.team_id,
  t.name as team_name,
  t.flag_url,
  tr.played,
  tr.points,
  rank() over (order by tr.points desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.teams t on t.id = tp.team_id
join team_results tr on tr.team_id = tp.team_id
where tp.team_id is not null;

create view public.player_pick_leaderboard
with (security_invoker = true) as
select
  tp.user_id,
  p.display_name,
  tp.player_id,
  pl.name as player_name,
  pl.image_url,
  coalesce(sum(pms.fpl_points), 0)::integer as points,
  rank() over (order by coalesce(sum(pms.fpl_points), 0) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.players pl on pl.id = tp.player_id
left join public.player_match_stats pms on pms.player_id = tp.player_id
where tp.player_id is not null
group by tp.user_id, p.display_name, tp.player_id, pl.name, pl.image_url;

create view public.keeper_pick_leaderboard
with (security_invoker = true) as
select
  tp.user_id,
  p.display_name,
  tp.keeper_id,
  pl.name as keeper_name,
  pl.image_url,
  coalesce(sum(pms.fpl_points), 0)::integer as points,
  rank() over (order by coalesce(sum(pms.fpl_points), 0) desc)::integer as rank
from public.tournament_picks tp
join public.profiles p on p.id = tp.user_id
join public.players pl on pl.id = tp.keeper_id
left join public.player_match_stats pms on pms.player_id = tp.keeper_id
where tp.keeper_id is not null
group by tp.user_id, p.display_name, tp.keeper_id, pl.name, pl.image_url;
