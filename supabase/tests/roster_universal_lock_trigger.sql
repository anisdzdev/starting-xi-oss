-- Universal late-entry lock (enforce_roster_lock, migration 20260613020000).
-- Run with:  docker cp supabase/tests/roster_universal_lock_trigger.sql <db>:/tmp/t.sql
--            docker exec <db> psql -U postgres -f /tmp/t.sql
-- Each block wraps in a DO so a raised exception is caught and reported PASS/FAIL.
--
-- Fixtures: STA vs OP1 kicked off 1h ago; FUT vs OP2 kicks off in 3h. So post-kickoff
-- the day's first kickoff is 1h in the past. "late" rosters are created now (>= first
-- kickoff); an "on-time" roster is created with created_at before the first kickoff.
begin;

-- ---- seed reference data (as postgres; bypasses RLS + the lock trigger via 'none' role)
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'late@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ontime@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Late User'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ontime User')
on conflict (id) do nothing;

insert into public.teams (fotmob_id, name, code) values
  (900001, 'Started FC', 'STA'), (900011, 'Started Opp', 'OP1'),
  (900002, 'Future FC', 'FUT'),  (900012, 'Future Opp', 'OP2')
on conflict (fotmob_id) do nothing;

insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team)
select 900001, (select id from public.seasons where status = 'active'), current_date, now() - interval '1 hour', 'live',
       (select id from public.teams where code='STA'),
       (select id from public.teams where code='OP1')
where not exists (select 1 from public.fixtures where fotmob_id = 900001);
insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team)
select 900002, (select id from public.seasons where status = 'active'), current_date, now() + interval '3 hours', 'scheduled',
       (select id from public.teams where code='FUT'),
       (select id from public.teams where code='OP2')
where not exists (select 1 from public.fixtures where fotmob_id = 900002);

insert into public.players (fotmob_id, season_id, team_id, name, position) values
  (900001, (select id from public.seasons where status = 'active'), (select id from public.teams where code='STA'), 'Started Player', 'MID'),
  (900002, (select id from public.seasons where status = 'active'), (select id from public.teams where code='FUT'), 'Future Player', 'MID')
on conflict (fotmob_id, season_id) do nothing;

-- a LATE roster for late@ (created now → created_at >= first kickoff), not finalized
insert into public.rosters (user_id, game_day, formation_code, captain_player_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, '4-3-3',
        (select id from public.players where fotmob_id=900002))
on conflict (user_id, game_day) do nothing;

-- an ON-TIME roster for ontime@ (created BEFORE the first kickoff), not finalized
insert into public.rosters (user_id, game_day, formation_code, captain_player_id, created_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, '4-3-3',
        (select id from public.players where fotmob_id=900002), now() - interval '2 hours')
on conflict (user_id, game_day) do nothing;

-- ---- act as the LATE user (authenticated, not the exempt service/none role)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true);

-- CASE 1: late roster + FUTURE team → INSERT allowed
do $$
declare v_rid uuid; v_pid bigint;
begin
  select id into v_rid from public.rosters
   where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and game_day=current_date;
  select id into v_pid from public.players where fotmob_id=900002;
  begin
    insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, v_pid, 1);
    raise notice 'CASE 1 PASS: late build, future-team insert allowed.';
  exception when others then
    raise notice 'CASE 1 FAIL: future-team insert rejected (%).', sqlerrm;
  end;
end $$;

-- CASE 2: late roster + STARTED team → INSERT rejected
do $$
declare v_rid uuid; v_pid bigint;
begin
  select id into v_rid from public.rosters
   where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and game_day=current_date;
  select id into v_pid from public.players where fotmob_id=900001;
  begin
    insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, v_pid, 2);
    raise notice 'CASE 2 FAIL: started-team insert succeeded but should be rejected.';
  exception when others then
    raise notice 'CASE 2 PASS: started-team insert rejected (%).', sqlerrm;
  end;
end $$;

-- CASE 5: late roster (still open) DELETE → allowed (rebuild clears rows)
do $$
declare v_rid uuid; v_pid bigint;
begin
  select id into v_rid from public.rosters
   where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and game_day=current_date;
  select id into v_pid from public.players where fotmob_id=900002;
  begin
    delete from public.roster_players where roster_id=v_rid and player_id=v_pid;
    raise notice 'CASE 5 PASS: late build delete allowed.';
  exception when others then
    raise notice 'CASE 5 FAIL: late build delete rejected (%).', sqlerrm;
  end;
end $$;

-- CASE 4: finalize the late roster (stamp locked_at), then a further insert → rejected
do $$
declare v_rid uuid; v_pid bigint;
begin
  select id into v_rid from public.rosters
   where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and game_day=current_date;
  update public.rosters set locked_at = now() where id = v_rid;  -- finalize (allowed: open late roster)
  select id into v_pid from public.players where fotmob_id=900002;
  begin
    insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, v_pid, 3);
    raise notice 'CASE 4 FAIL: insert after finalize succeeded but should be rejected.';
  exception when others then
    raise notice 'CASE 4 PASS: insert after finalize (one-shot) rejected (%).', sqlerrm;
  end;
end $$;

-- ---- act as the ON-TIME user
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', true);

-- CASE 3: on-time roster (created before kickoff) post-kickoff insert → rejected (frozen)
do $$
declare v_rid uuid; v_pid bigint;
begin
  select id into v_rid from public.rosters
   where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and game_day=current_date;
  select id into v_pid from public.players where fotmob_id=900002;  -- even a future team
  begin
    insert into public.roster_players (roster_id, player_id, slot_position) values (v_rid, v_pid, 1);
    raise notice 'CASE 3 FAIL: on-time roster edit after kickoff succeeded but should be frozen.';
  exception when others then
    raise notice 'CASE 3 PASS: on-time roster frozen at kickoff (%).', sqlerrm;
  end;
end $$;

rollback;
