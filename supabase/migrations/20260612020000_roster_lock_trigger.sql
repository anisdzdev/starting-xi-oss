-- Server-side roster lock: once the game day's first kickoff has passed, user
-- writes to rosters / roster_players are rejected at the database level
-- (client checks are just UX — this is the enforcement).
--
-- The service role and direct (non-JWT) connections are exempt so system jobs
-- (e.g. stamping locked_at, admin fixes, cleanup) keep working.

create or replace function public.enforce_roster_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_game_day date;
  v_old_game_day date;
  v_first timestamptz;
  v_role text;
begin
  -- exempt service role and direct database connections
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'none'
  );
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'rosters' then
    v_game_day := (case when tg_op = 'DELETE' then old.game_day else new.game_day end);
    v_old_game_day := (case when tg_op = 'UPDATE' then old.game_day else null end);
  else
    select r.game_day into v_game_day
    from public.rosters r
    where r.id = (case when tg_op = 'DELETE' then old.roster_id else new.roster_id end);
  end if;

  -- check the target day (and, on updates, the original day so a locked roster
  -- can't be "moved" to an open day)
  select min(f.kickoff_utc) into v_first
  from public.fixtures f
  where f.game_day in (v_game_day, coalesce(v_old_game_day, v_game_day));

  if v_first is not null and now() >= v_first then
    raise exception 'XI is locked — first kickoff on % was at %', v_game_day, v_first
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists rosters_enforce_lock on public.rosters;
create trigger rosters_enforce_lock
  before insert or update or delete on public.rosters
  for each row execute function public.enforce_roster_lock();

drop trigger if exists roster_players_enforce_lock on public.roster_players;
create trigger roster_players_enforce_lock
  before insert or update or delete on public.roster_players
  for each row execute function public.enforce_roster_lock();
