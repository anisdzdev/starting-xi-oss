-- seasons + season-scoped overall_leaderboard (migration 20261014000000). Run with:
--   docker cp supabase/tests/seasons_overall_leaderboard.sql <db>:/tmp/t.sql
--   docker exec <db> psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
begin;

-- two users ---------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'season-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'season-b@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Season A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Season B')
on conflict (id) do nothing;

-- a nation (WC) and a club (UCL) fixture ---------------------------------------
insert into public.teams (fotmob_id, name, code) values
  (930001, 'Nation One', 'NO1'), (930002, 'Nation Two', 'NO2'),
  (930003, 'Club One', 'CO1'),   (930004, 'Club Two', 'CO2')
on conflict (fotmob_id) do nothing;

insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status,
                             home_team, away_team, home_score, away_score)
values
  (930001, 'wc2026',  '2026-06-15', '2026-06-15 20:00+00', 'finished',
    (select id from public.teams where code = 'NO1'),
    (select id from public.teams where code = 'NO2'), 1, 0),
  (930002, 'ucl2026', '2026-10-21', '2026-10-21 19:00+00', 'finished',
    (select id from public.teams where code = 'CO1'),
    (select id from public.teams where code = 'CO2'), 2, 2)
on conflict (fotmob_id) do nothing;

-- the SAME person registered in both seasons (one row per season) --------------
insert into public.players (fotmob_id, season_id, team_id, name, position) values
  (930101, 'wc2026',  (select id from public.teams where code = 'NO1'), 'Two Season Star', 'FWD'),
  (930101, 'ucl2026', (select id from public.teams where code = 'CO1'), 'Two Season Star', 'FWD')
on conflict (fotmob_id, season_id) do nothing;

insert into public.player_match_stats (player_id, fixture_id, minutes, goals, fpl_points) values
  ((select id from public.players where fotmob_id = 930101 and season_id = 'wc2026'),
   (select id from public.fixtures where fotmob_id = 930001), 90, 1, 10),
  ((select id from public.players where fotmob_id = 930101 and season_id = 'ucl2026'),
   (select id from public.fixtures where fotmob_id = 930002), 90, 0, 2)
on conflict (player_id, fixture_id) do nothing;

-- user A picks the WC row on the WC day; user B picks the UCL row on the UCL day
do $$
declare v_rid uuid;
begin
  insert into public.rosters (user_id, game_day, formation_code)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', '2026-06-15', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values
    (v_rid, (select id from public.players where fotmob_id = 930101 and season_id = 'wc2026'), 11);

  insert into public.rosters (user_id, game_day, formation_code)
  values ('bbbbbbbb-0000-0000-0000-00000000000b', '2026-10-21', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values
    (v_rid, (select id from public.players where fotmob_id = 930101 and season_id = 'ucl2026'), 11);
end $$;

-- assertions ------------------------------------------------------------------
do $$
declare
  v_a_wc int; v_a_ucl int; v_b_ucl int; v_b_rank int; v_rows int;
begin
  select points into v_a_wc from public.overall_leaderboard
    where season_id = 'wc2026' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select count(*) into v_a_ucl from public.overall_leaderboard
    where season_id = 'ucl2026' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select points, rank into v_b_ucl, v_b_rank from public.overall_leaderboard
    where season_id = 'ucl2026' and user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';

  if v_a_wc <> 10 then raise exception 'A should have 10 WC points, got %', v_a_wc; end if;
  if v_a_ucl <> 0 then raise exception 'A must not appear on the UCL board'; end if;
  if v_b_ucl <> 2 then raise exception 'B should have 2 UCL points, got %', v_b_ucl; end if;
  -- B is the only test user on the UCL board, but real seed users may share it:
  -- rank must be computed WITHIN the season, so B's rank equals 1 + the number of
  -- UCL rows with more points.
  select 1 + count(*) into v_rows from public.overall_leaderboard
    where season_id = 'ucl2026' and points > v_b_ucl;
  if v_b_rank <> v_rows then raise exception 'B rank % should be %', v_b_rank, v_rows; end if;

  if public.season_of_day('2026-06-15') <> 'wc2026' then raise exception 'season_of_day WC'; end if;
  if public.season_of_day('2026-10-21') <> 'ucl2026' then raise exception 'season_of_day UCL'; end if;
  if public.season_of_day('2026-08-01') is not null then raise exception 'season_of_day gap'; end if;

  raise notice 'seasons_overall_leaderboard: ok';
end $$;

rollback;
