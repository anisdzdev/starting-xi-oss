-- User competitions (migration 20261014020000): spans, standings (xi + pick), lock
-- trigger, pick validation, delete-by-creator. Run with:
--   docker cp supabase/tests/competitions.sql <db>:/tmp/t.sql
--   docker exec <db> psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001', 'comp-a@example.test'),
  ('22222222-0000-0000-0000-000000000002', 'comp-b@example.test'),
  ('33333333-0000-0000-0000-000000000003', 'comp-c@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001', 'Comp A'),
  ('22222222-0000-0000-0000-000000000002', 'Comp B'),
  ('33333333-0000-0000-0000-000000000003', 'Comp C')
on conflict (id) do nothing;

insert into public.teams (fotmob_id, name, code) values
  (950001, 'Comp FC', 'CF1'), (950002, 'Comp Utd', 'CU2')
on conflict (fotmob_id) do nothing;

-- A FUTURE round (md9: still open) and a PAST round (md10 fixtures finished — a
-- competition on it is locked). Both well outside the real seed's dates.
insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team,
                             home_score, away_score, stage, matchday)
values
  (950001, 'ucl2026', '2027-04-06', now() + interval '10 days', 'scheduled',
    (select id from public.teams where code='CF1'), (select id from public.teams where code='CU2'), null, null, 'league', 9),
  (950002, 'ucl2026', '2026-09-01', '2026-09-01 19:00+00', 'finished',
    (select id from public.teams where code='CU2'), (select id from public.teams where code='CF1'), 2, 1, 'league', 10)
on conflict (fotmob_id) do nothing;

insert into public.players (fotmob_id, season_id, team_id, name, position) values
  (950101, 'ucl2026', (select id from public.teams where code='CF1'), 'Comp Keeper', 'GK'),
  (950102, 'ucl2026', (select id from public.teams where code='CF1'), 'Comp Striker', 'FWD'),
  (950101, 'wc2026',  (select id from public.teams where code='CF1'), 'Comp Keeper (WC)', 'GK')
on conflict (fotmob_id, season_id) do nothing;

-- Past round points: keeper 6, striker 9 in the finished md10 fixture; A's XI had the striker.
insert into public.player_match_stats (player_id, fixture_id, minutes, fpl_points) values
  ((select id from public.players where fotmob_id=950101 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=950002), 90, 6),
  ((select id from public.players where fotmob_id=950102 and season_id='ucl2026'), (select id from public.fixtures where fotmob_id=950002), 90, 9)
on conflict (player_id, fixture_id) do nothing;
do $$
declare v_rid uuid;
begin
  insert into public.rosters (user_id, game_day, formation_code) values ('11111111-0000-0000-0000-000000000001', '2026-09-01', '4-3-3') returning id into v_rid;
  insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, (select id from public.players where fotmob_id=950102 and season_id='ucl2026'), 11);
end $$;

-- ---------------------------------------------------------------- as user A (authenticated)
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-0000-0000-0000-000000000001"}', true);

-- CASE 1: create an OPEN xi competition on the future round → allowed
insert into public.competitions (id, season_id, name, reward, metric, from_round, to_round, created_by, created_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'ucl2026', 'Best of MD9', 'Dinner', 'xi', 'md9', 'md9',
        '11111111-0000-0000-0000-000000000001', '2099-01-01'); -- created_at must be ignored
-- CASE 2: a keeper-pick competition on the same open round
insert into public.competitions (id, season_id, name, metric, pick_kind, from_round, to_round, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'ucl2026', 'Keeper MD9', 'pick', 'keeper', 'md9', 'md9',
        '11111111-0000-0000-0000-000000000001');

-- CASE 3: a competition on the PAST round → rejected (span already started)
do $$ begin
  begin
    insert into public.competitions (season_id, name, metric, from_round, to_round, created_by)
    values ('ucl2026', 'Too late', 'xi', 'md10', 'md10', '11111111-0000-0000-0000-000000000001');
    raise exception 'CASE 3 FAIL: competition on a started round was allowed';
  exception when others then
    raise notice 'CASE 3 PASS: started round rejected (%)', sqlerrm;
  end;
end $$;

-- CASE 4: reversed rounds → rejected
do $$ begin
  begin
    -- md10 (2026-09-01) starts before md9 (future) → reversed; both rounds exist
    insert into public.competitions (season_id, name, metric, from_round, to_round, created_by)
    values ('ucl2026', 'Backwards', 'xi', 'md9', 'md10', '11111111-0000-0000-0000-000000000001');
    raise exception 'CASE 4 FAIL: reversed span allowed';
  exception when others then
    if sqlerrm not like 'The competition must end after it starts%' then raise; end if;
    raise notice 'CASE 4 PASS: reversed span rejected (%)', sqlerrm;
  end;
end $$;

-- CASE 5: join the xi competition (no pick) → allowed; a pick on an xi competition → rejected
-- (as user C, so a duplicate-key error can't masquerade as the trigger's rejection)
insert into public.competition_members (competition_id, user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"33333333-0000-0000-0000-000000000003"}', true);
do $$ begin
  begin
    insert into public.competition_members (competition_id, user_id, pick_player_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '33333333-0000-0000-0000-000000000003',
            (select id from public.players where fotmob_id=950101 and season_id='ucl2026'));
    raise exception 'CASE 5 FAIL: pick on an xi competition allowed';
  exception when others then
    if sqlerrm not like 'This competition scores your XI%' then raise; end if;
    raise notice 'CASE 5 PASS: pick on xi competition rejected (%)', sqlerrm;
  end;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-0000-0000-0000-000000000001"}', true);

-- CASE 6: keeper competition — outfield pick rejected, WC-season keeper rejected, CL keeper allowed
do $$ begin
  begin
    insert into public.competition_members (competition_id, user_id, pick_player_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-0000-0000-0000-000000000001',
            (select id from public.players where fotmob_id=950102 and season_id='ucl2026'));
    raise exception 'CASE 6a FAIL: outfield pick on keeper competition allowed';
  exception when others then
    raise notice 'CASE 6a PASS: outfield pick rejected (%)', sqlerrm;
  end;
  begin
    insert into public.competition_members (competition_id, user_id, pick_player_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-0000-0000-0000-000000000001',
            (select id from public.players where fotmob_id=950101 and season_id='wc2026'));
    raise exception 'CASE 6b FAIL: other-season pick allowed';
  exception when others then
    raise notice 'CASE 6b PASS: other-season pick rejected (%)', sqlerrm;
  end;
  insert into public.competition_members (competition_id, user_id, pick_player_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-0000-0000-0000-000000000001',
          (select id from public.players where fotmob_id=950101 and season_id='ucl2026'));
  raise notice 'CASE 6c PASS: CL keeper pick allowed';
  -- CASE 6d: changing the pick (UPDATE) is validated too
  begin
    update public.competition_members set pick_player_id = (select id from public.players where fotmob_id=950102 and season_id='ucl2026')
     where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' and user_id = '11111111-0000-0000-0000-000000000001';
    raise exception 'CASE 6d FAIL: outfield pick via UPDATE allowed';
  exception when others then
    if sqlerrm not like 'Pick a goalkeeper%' then raise; end if;
    raise notice 'CASE 6d PASS: pick change validated (%)', sqlerrm;
  end;
  -- CASE 6e: a client-chosen created_at is overwritten by the server
  if (select created_at from public.competitions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') > now() then
    raise exception 'CASE 6e FAIL: created_at not server-owned';
  end if;
end $$;

-- B joins the xi competition too (so the standings have two rows)
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"22222222-0000-0000-0000-000000000002"}', true);
insert into public.competition_members (competition_id, user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-0000-0000-0000-000000000002');

-- CASE 7: B cannot delete A's competition (RLS) — 0 rows affected
do $$ declare v_n int; begin
  delete from public.competitions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'CASE 7 PASS: non-creator delete is a no-op'; else raise exception 'CASE 7 FAIL: non-creator deleted'; end if;
end $$;

-- ---------------------------------------------------------------- views (as postgres)
reset role;
select set_config('request.jwt.claims', '', true); -- back to a direct connection (lock-exempt)
do $$
declare v_status text; v_n int; v_a int; v_b int; v_rank_a int; v_pick text;
begin
  select status into v_status from public.competition_spans where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  if v_status <> 'open' then raise exception 'future-round competition should be open, got %', v_status; end if;

  -- everyone who joined is listed, at 0 while nothing has been played
  select count(*) into v_n from public.competition_standings where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  if v_n <> 2 then raise exception 'xi standings should list both members, got %', v_n; end if;
  select points into v_a from public.competition_standings
    where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' and user_id = '11111111-0000-0000-0000-000000000001';
  if v_a <> 0 then raise exception 'A should have 0 so far, got %', v_a; end if;

  -- the keeper competition shows the pick
  select pick_name into v_pick from public.competition_standings
    where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' and user_id = '11111111-0000-0000-0000-000000000001';
  if v_pick <> 'Comp Keeper' then raise exception 'keeper standings should carry the pick name, got %', v_pick; end if;

  raise notice 'competitions views (open): ok';
end $$;

-- ---------------------------------------------------------------- a finished competition (service role seeds it)
-- Service role is exempt from the lock, so we can create one on the PAST round and
-- check that points flow: A's XI scored 9 (striker), keeper-pick scores 6.
insert into public.competitions (id, season_id, name, metric, from_round, to_round, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'ucl2026', 'Past xi', 'xi', 'md10', 'md10', '11111111-0000-0000-0000-000000000001');
insert into public.competition_members (competition_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-0000-0000-0000-000000000002');
insert into public.competitions (id, season_id, name, metric, pick_kind, from_round, to_round, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'ucl2026', 'Past keeper', 'pick', 'keeper', 'md10', 'md10', '11111111-0000-0000-0000-000000000001');
insert into public.competition_members (competition_id, user_id, pick_player_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '11111111-0000-0000-0000-000000000001',
   (select id from public.players where fotmob_id=950101 and season_id='ucl2026'));

do $$
declare v_status text; v_a int; v_b int; v_rank_a int; v_rank_b int; v_k int;
begin
  select status into v_status from public.competition_spans where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  if v_status <> 'finished' then raise exception 'past-round competition should be finished, got %', v_status; end if;
  select points, rank into v_a, v_rank_a from public.competition_standings
    where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' and user_id = '11111111-0000-0000-0000-000000000001';
  select points, rank into v_b, v_rank_b from public.competition_standings
    where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' and user_id = '22222222-0000-0000-0000-000000000002';
  if v_a <> 9 or v_rank_a <> 1 then raise exception 'A should win with 9, got % rank %', v_a, v_rank_a; end if;
  if v_b <> 0 or v_rank_b <> 2 then raise exception 'B should be second with 0, got % rank %', v_b, v_rank_b; end if;
  select points into v_k from public.competition_standings
    where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4' and user_id = '11111111-0000-0000-0000-000000000001';
  if v_k <> 6 then raise exception 'keeper pick should score 6, got %', v_k; end if;
  raise notice 'competitions views (finished): ok';
end $$;

-- CASE 8: A cannot leave / delete a finished (locked) competition as an authenticated user
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-0000-0000-0000-000000000001"}', true);
do $$ begin
  begin
    delete from public.competition_members where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' and user_id = '11111111-0000-0000-0000-000000000001';
    raise exception 'CASE 8a FAIL: leaving a started competition was allowed';
  exception when others then
    if sqlerrm not like 'This competition has already started%' then raise; end if;
    raise notice 'CASE 8a PASS: leave after start rejected (%)', sqlerrm;
  end;
  begin
    delete from public.competitions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
    raise exception 'CASE 8b FAIL: deleting a started competition was allowed';
  exception when others then
    if sqlerrm not like 'This competition has already started%' then raise; end if;
    raise notice 'CASE 8b PASS: delete after start rejected (%)', sqlerrm;
  end;
  -- CASE 8d: C cannot JOIN a started competition
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"33333333-0000-0000-0000-000000000003"}', true);
  begin
    insert into public.competition_members (competition_id, user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '33333333-0000-0000-0000-000000000003');
    raise exception 'CASE 8d FAIL: joining a started competition was allowed';
  exception when others then
    if sqlerrm not like 'This competition has already started%' then raise; end if;
    raise notice 'CASE 8d PASS: join after start rejected (%)', sqlerrm;
  end;
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-0000-0000-0000-000000000001"}', true);
  -- CASE 8e: A cannot escape the started competition by moving the row to the open one
  begin
    update public.competition_members set competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
     where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' and user_id = '11111111-0000-0000-0000-000000000001';
    raise exception 'CASE 8e FAIL: membership moved to another competition';
  exception when others then
    if sqlerrm not like 'Leave and rejoin%' then raise; end if;
    raise notice 'CASE 8e PASS: membership move rejected (%)', sqlerrm;
  end;
  -- deleting the OPEN one is fine and cascades its members
  delete from public.competitions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  raise notice 'CASE 8c PASS: creator deleted an open competition';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ declare v_n int; begin
  select count(*) into v_n from public.competition_members where competition_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  if v_n <> 0 then raise exception 'members should cascade on delete, % left', v_n; end if;
  raise notice 'competitions: ok';
end $$;

rollback;
