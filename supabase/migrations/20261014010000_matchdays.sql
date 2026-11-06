-- Rounds: a league-phase matchday (its Tuesday + Wednesday) or a knockout stage.
-- The XI stays per game day; a round is the unit Standings (Matchday board) and
-- user competitions (sub-project 3) aggregate over.
-- See docs/superpowers/specs/2026-10-14-matchday-format-design.md.

-- 1) matchday number (FotMob `round` "1".."8" / by-date `tournamentStage`), null
--    outside the league/group phase. Ingest writes it; existing rows backfill via a
--    seed re-run (WC rows stay null → the whole group stage is one round).
alter table public.fixtures add column matchday smallint
  check (matchday is null or matchday between 1 and 60); -- 38-round leagues fit

-- 2) round_key: 'md<N>' in the league/group phase when the matchday is known,
--    else the stage ('group', 'playoff', 'r32', 'r16', 'qf', 'sf', 'third', 'final').
alter table public.fixtures add column round_key text generated always as (
  case
    when stage in ('league', 'group') and matchday is not null then 'md' || matchday::text
    else stage
  end
) stored;

create index fixtures_season_round_idx on public.fixtures (season_id, round_key);

-- 3) season_rounds: one row per (season, round) with its game-day range — the
--    client's round selector reads this (ordered by starts_on).
create or replace view public.season_rounds
with (security_invoker = true) as
select
  f.season_id,
  f.round_key,
  min(f.stage) as stage,
  min(f.matchday) as matchday,
  min(f.game_day) as starts_on,
  max(f.game_day) as ends_on,
  count(*)::integer as fixtures
from public.fixtures f
group by f.season_id, f.round_key;

-- 4) round_leaderboard: daily points summed over the round's game days, ranked
--    within (season, round). daily_leaderboard emits a 0-point row as soon as an
--    XI is saved (before kickoff), so only days with a STARTED fixture count as
--    played, and a user appears only once one of their days has started
--    (days_played shows 1 mid-round; nobody shows up the morning before).
create or replace view public.round_leaderboard
with (security_invoker = true) as
with round_days as (
  select season_id, round_key, game_day,
         bool_or(status in ('live', 'finished')) as started
  from public.fixtures
  group by season_id, round_key, game_day
)
select
  rd.season_id,
  rd.round_key,
  d.user_id,
  d.display_name,
  d.avatar_url,
  sum(d.points)::integer as points,
  (count(*) filter (where rd.started))::integer as days_played,
  rank() over (partition by rd.season_id, rd.round_key order by sum(d.points) desc)::integer as rank
from public.daily_leaderboard d
join round_days rd on rd.game_day = d.game_day
group by rd.season_id, rd.round_key, d.user_id, d.display_name, d.avatar_url
having bool_or(rd.started);
