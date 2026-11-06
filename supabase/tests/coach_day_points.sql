-- coach_day_points + daily_leaderboard fold-in (migration 20260619000000). Run with:
--   docker cp supabase/tests/coach_day_points.sql <db>:/tmp/t.sql
--   docker exec <db> psql -U postgres -f /tmp/t.sql
begin;

insert into auth.users (id, email) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'coachscore@example.test') on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Coach Score') on conflict (id) do nothing;

insert into public.teams (fotmob_id, name, code) values
  (920001, 'Score FC', 'SCF'), (920002, 'Opp FC', 'OPF') on conflict (fotmob_id) do nothing;

insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team,
                             home_score, away_score, motm_player_id)
select 920001, (select id from public.seasons where status = 'active'), current_date, now() - interval '2 hours', 'finished',
       (select id from public.teams where code='SCF'),
       (select id from public.teams where code='OPF'),
       2, 1, 920101  -- MOTM is the sub below (fotmob_id 920101)
where not exists (select 1 from public.fixtures where fotmob_id = 920001);

-- a SUB who scored 1, assisted 1, and is MOTM; plus a STARTER who scored (should NOT count)
insert into public.players (fotmob_id, season_id, team_id, name, position) values
  (920101, (select id from public.seasons where status = 'active'), (select id from public.teams where code='SCF'), 'Sub Hero', 'FWD'),
  (920102, (select id from public.seasons where status = 'active'), (select id from public.teams where code='SCF'), 'Starter Joe', 'MID')
on conflict (fotmob_id, season_id) do nothing;

insert into public.player_match_stats (player_id, fixture_id, minutes, goals, assists, is_sub, fpl_points)
values
  ((select id from public.players where fotmob_id=920101),
   (select id from public.fixtures where fotmob_id=920001), 30, 1, 1, true, 9),
  ((select id from public.players where fotmob_id=920102),
   (select id from public.fixtures where fotmob_id=920001), 90, 1, 0, false, 6)
on conflict (player_id, fixture_id) do nothing;

insert into public.coaches (id, name, team_id) values
  (920001, 'Test Coach', (select id from public.teams where code='SCF')) on conflict (id) do nothing;

-- coach got a yellow
insert into public.coach_match_stats (coach_id, fixture_id, team_id, yellows, reds)
values (920001, (select id from public.fixtures where fotmob_id=920001),
        (select id from public.teams where code='SCF'), 1, 0)
on conflict do nothing;

insert into public.coach_picks (user_id, game_day, coach_id, team_id, created_at)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', current_date, 920001,
        (select id from public.teams where code='SCF'), now() - interval '5 hours')
on conflict do nothing;

-- Expected: sub goal +3, sub assist +2, MOTM +3, win +5, yellow -1 = 12
do $$
declare v_pts integer;
begin
  select points into v_pts from public.coach_day_points
   where user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and game_day=current_date;
  if v_pts = 12 then raise notice 'SCORE PASS: coach points = 12.';
  else raise notice 'SCORE FAIL: coach points = % (expected 12).', v_pts; end if;
end $$;

-- daily_leaderboard fold-in: user has no roster, so daily points should equal coach points (12)
do $$
declare v_pts integer;
begin
  select points into v_pts from public.daily_leaderboard
   where user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and game_day=current_date;
  if v_pts = 12 then raise notice 'FOLD PASS: daily total includes coach points (12).';
  else raise notice 'FOLD FAIL: daily total = % (expected 12).', v_pts; end if;
end $$;

rollback;
