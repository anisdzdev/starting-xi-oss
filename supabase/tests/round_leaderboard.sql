-- Rounds: fixtures.matchday / round_key + season_rounds + round_leaderboard
-- (migration 20261014010000). Run with:
--   docker cp supabase/tests/round_leaderboard.sql <db>:/tmp/t.sql
--   docker exec <db> psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
begin;

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000000c', 'round-c@example.test'),
  ('dddddddd-0000-0000-0000-00000000000d', 'round-d@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('cccccccc-0000-0000-0000-00000000000c', 'Round C'),
  ('dddddddd-0000-0000-0000-00000000000d', 'Round D')
on conflict (id) do nothing;

insert into public.teams (fotmob_id, name, code) values
  (940001, 'Round FC', 'RF1'), (940002, 'Round Utd', 'RU2'), (940003, 'Round City', 'RC3')
on conflict (fotmob_id) do nothing;

-- Matchday 3 spans two game days; matchday 4 one day so far; a knockout fixture has no matchday.
insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team,
                             home_score, away_score, stage, matchday)
values
  (940001, 'ucl2026', '2026-10-20', '2026-10-20 19:00+00', 'finished',
    (select id from public.teams where code='RF1'), (select id from public.teams where code='RU2'), 1, 0, 'league', 3),
  (940002, 'ucl2026', '2026-10-21', '2026-10-21 19:00+00', 'finished',
    (select id from public.teams where code='RC3'), (select id from public.teams where code='RF1'), 2, 2, 'league', 3),
  (940003, 'ucl2026', '2026-11-03', '2026-11-03 19:00+00', 'finished',
    (select id from public.teams where code='RU2'), (select id from public.teams where code='RC3'), 0, 1, 'league', 4),
  (940004, 'ucl2026', '2027-02-16', '2027-02-16 20:00+00', 'scheduled',
    (select id from public.teams where code='RF1'), (select id from public.teams where code='RC3'), null, null, 'playoff', null),
  -- md4's second day has NOT kicked off yet
  (940005, 'ucl2026', '2026-11-04', '2026-11-04 20:00+00', 'scheduled',
    (select id from public.teams where code='RF1'), (select id from public.teams where code='RU2'), null, null, 'league', 4)
on conflict (fotmob_id) do nothing;

insert into public.players (fotmob_id, season_id, team_id, name, position) values
  (940101, 'ucl2026', (select id from public.teams where code='RF1'), 'Round Striker', 'FWD'),
  (940102, 'ucl2026', (select id from public.teams where code='RC3'), 'Round Keeper', 'GK')
on conflict (fotmob_id, season_id) do nothing;

-- points: striker 8 on 10-20, 4 on 10-21; keeper 6 on 10-21, 2 on 11-03
insert into public.player_match_stats (player_id, fixture_id, minutes, fpl_points) values
  ((select id from public.players where fotmob_id=940101 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=940001), 90, 8),
  ((select id from public.players where fotmob_id=940101 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=940002), 90, 4),
  ((select id from public.players where fotmob_id=940102 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=940002), 90, 6),
  ((select id from public.players where fotmob_id=940102 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=940003), 90, 2)
on conflict (player_id, fixture_id) do nothing;

-- C picks the striker on both MD3 days (8 + 4 = 12); D picks the keeper on 10-21 (6) and 11-03 (2)
do $$
declare v_rid uuid;
begin
  insert into public.rosters (user_id, game_day, formation_code) values ('cccccccc-0000-0000-0000-00000000000c', '2026-10-20', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940101 and season_id='ucl2026'), 11);
  insert into public.rosters (user_id, game_day, formation_code) values ('cccccccc-0000-0000-0000-00000000000c', '2026-10-21', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940101 and season_id='ucl2026'), 11);
  insert into public.rosters (user_id, game_day, formation_code) values ('dddddddd-0000-0000-0000-00000000000d', '2026-10-21', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940102 and season_id='ucl2026'), 1);
  insert into public.rosters (user_id, game_day, formation_code) values ('dddddddd-0000-0000-0000-00000000000d', '2026-11-03', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940102 and season_id='ucl2026'), 1);
  -- D and C both saved an XI for the unplayed 11-04 (0 points so far)
  insert into public.rosters (user_id, game_day, formation_code) values ('dddddddd-0000-0000-0000-00000000000d', '2026-11-04', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940102 and season_id='ucl2026'), 1);
  insert into public.rosters (user_id, game_day, formation_code) values ('cccccccc-0000-0000-0000-00000000000c', '2026-11-04', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=940101 and season_id='ucl2026'), 11);
end $$;

do $$
declare
  v_key text; v_c int; v_c_days int; v_c_rank int; v_d int; v_d_rank int; v_d_md4 int; v_d_md4_days int;
  v_starts date; v_ends date; v_n int;
begin
  -- round_key: generated from stage + matchday
  select round_key into v_key from public.fixtures where fotmob_id = 940001;
  if v_key <> 'md3' then raise exception 'round_key for MD3 should be md3, got %', v_key; end if;
  select round_key into v_key from public.fixtures where fotmob_id = 940004;
  if v_key <> 'playoff' then raise exception 'knockout round_key should be the stage, got %', v_key; end if;

  -- season_rounds: md3 spans both days
  select starts_on, ends_on, fixtures into v_starts, v_ends, v_n
    from public.season_rounds where season_id = 'ucl2026' and round_key = 'md3';
  if v_starts <> '2026-10-20' or v_ends <> '2026-10-21' or v_n < 2 then
    raise exception 'season_rounds md3 wrong: % % %', v_starts, v_ends, v_n; end if;

  -- round_leaderboard: C = 12 over 2 days, D = 6 over 1 day in md3; D = 2 in md4
  select points, days_played, rank into v_c, v_c_days, v_c_rank from public.round_leaderboard
    where season_id='ucl2026' and round_key='md3' and user_id='cccccccc-0000-0000-0000-00000000000c';
  select points, rank into v_d, v_d_rank from public.round_leaderboard
    where season_id='ucl2026' and round_key='md3' and user_id='dddddddd-0000-0000-0000-00000000000d';
  select points, days_played into v_d_md4, v_d_md4_days from public.round_leaderboard
    where season_id='ucl2026' and round_key='md4' and user_id='dddddddd-0000-0000-0000-00000000000d';
  if v_c <> 12 or v_c_days <> 2 then raise exception 'C md3 should be 12 over 2 days, got % / %', v_c, v_c_days; end if;
  if v_d <> 6 then raise exception 'D md3 should be 6, got %', v_d; end if;
  if v_c_rank >= v_d_rank then raise exception 'C must rank above D in md3 (% vs %)', v_c_rank, v_d_rank; end if;
  -- D's unplayed 11-04 XI must not count: still 2 points over 1 PLAYED day
  if v_d_md4 <> 2 or v_d_md4_days <> 1 then raise exception 'D md4 should be 2 over 1 played day, got % / %', v_d_md4, v_d_md4_days; end if;
  -- C only has an XI on the unplayed day → not on the md4 board at all
  select count(*) into v_n from public.round_leaderboard
    where season_id='ucl2026' and round_key='md4' and user_id='cccccccc-0000-0000-0000-00000000000c';
  if v_n <> 0 then raise exception 'C must not appear in md4 (only an unplayed day)'; end if;

  raise notice 'round_leaderboard: ok';
end $$;

rollback;
