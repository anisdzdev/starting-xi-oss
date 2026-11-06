-- enforce_coach_pick_lock (migration 20260619000100). Run with:
--   docker cp supabase/tests/coach_pick_lock_trigger.sql <db>:/tmp/t.sql
--   docker exec <db> psql -U postgres -f /tmp/t.sql
-- Fixtures: STA kicked off 1h ago; FUT kicks off in 3h. First kickoff = 1h ago.
begin;

insert into auth.users (id, email) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'coachlate@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'coachontime@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Coach Late'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Coach Ontime')
on conflict (id) do nothing;

insert into public.teams (fotmob_id, name, code) values
  (910001, 'CStarted FC', 'CSA'), (910011, 'CStarted Opp', 'CO1'),
  (910002, 'CFuture FC', 'CFU'),  (910012, 'CFuture Opp', 'CO2')
on conflict (fotmob_id) do nothing;

insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team)
select 910001, (select id from public.seasons where status = 'active'), current_date, now() - interval '1 hour', 'live',
       (select id from public.teams where code='CSA'),
       (select id from public.teams where code='CO1')
where not exists (select 1 from public.fixtures where fotmob_id = 910001);
insert into public.fixtures (fotmob_id, season_id, game_day, kickoff_utc, status, home_team, away_team)
select 910002, (select id from public.seasons where status = 'active'), current_date, now() + interval '3 hours', 'scheduled',
       (select id from public.teams where code='CFU'),
       (select id from public.teams where code='CO2')
where not exists (select 1 from public.fixtures where fotmob_id = 910002);

insert into public.coaches (id, name, team_id) values
  (910001, 'Started Coach', (select id from public.teams where code='CSA')),
  (910002, 'Future Coach',  (select id from public.teams where code='CFU'))
on conflict (id) do nothing;

-- ON-TIME pick (created before first kickoff) for the ontime user
insert into public.coach_picks (user_id, game_day, coach_id, team_id, created_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', current_date, 910002,
        (select id from public.teams where code='CFU'), now() - interval '2 hours')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', true);

-- CASE 1: late pick of a FUTURE-team coach → INSERT allowed
do $$ begin
  begin
    insert into public.coach_picks (user_id, game_day, coach_id, team_id)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', current_date, 910002,
            (select id from public.teams where code='CFU'));
    raise notice 'CASE 1 PASS: late future-team pick allowed.';
  exception when others then
    raise notice 'CASE 1 FAIL: %', sqlerrm;
  end;
end $$;

-- CASE 2: late pick of a STARTED-team coach → rejected
do $$ begin
  begin
    insert into public.coach_picks (user_id, game_day, coach_id, team_id)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', current_date, 910001,
            (select id from public.teams where code='CSA'))
    on conflict (user_id, game_day) do update set coach_id = excluded.coach_id, team_id = excluded.team_id;
    raise notice 'CASE 2 FAIL: started-team pick was allowed.';
  exception when others then
    raise notice 'CASE 2 PASS: started-team pick rejected (%).', sqlerrm;
  end;
end $$;

-- CASE 3: finalize the late pick (stamp locked_at) → allowed; then re-edit → rejected
do $$ declare v_n int; begin
  begin
    update public.coach_picks set locked_at = now()
     where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and game_day=current_date;
    raise notice 'CASE 3a PASS: finalize (locked_at) allowed.';
  exception when others then
    raise notice 'CASE 3a FAIL: %', sqlerrm;
  end;
  begin
    update public.coach_picks set coach_id = 910002
     where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and game_day=current_date;
    -- The RLS update policy (locked_at is null) turns this into a silent no-op
    -- before the trigger ever sees it — zero rows touched is still "rejected".
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise notice 'CASE 3b PASS: edit after finalize was a no-op (RLS filtered the row).';
    else
      raise notice 'CASE 3b FAIL: edit after finalize was allowed.';
    end if;
  exception when others then
    raise notice 'CASE 3b PASS: edit after finalize rejected (%).', sqlerrm;
  end;
end $$;

-- CASE 4: ON-TIME pick edited after kickoff → rejected
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}', true);
do $$ begin
  begin
    update public.coach_picks set coach_id = 910002
     where user_id='dddddddd-dddd-dddd-dddd-dddddddddddd' and game_day=current_date;
    raise notice 'CASE 4 FAIL: on-time pick edit after kickoff allowed.';
  exception when others then
    raise notice 'CASE 4 PASS: on-time pick frozen (%).', sqlerrm;
  end;
end $$;

rollback;
