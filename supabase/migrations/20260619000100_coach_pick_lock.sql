-- Universal late entry for the daily coach pick (same rule as the roster):
--   * Before the day's first kickoff: unlimited edits.
--   * After it: an on-time pick (created before kickoff) freezes; a user with no
--     pick yet may build ONE, only for a coach whose team hasn't kicked off, and it
--     locks the instant it's saved (client stamps locked_at). service_role/direct
--     connections are exempt.
-- Modeled on enforce_roster_lock() in 20260613020000_universal_late_entry.sql.

create or replace function public.enforce_coach_pick_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_game_day date;
  v_old_game_day date;
  v_first timestamptz;
  v_role text;
  v_created_at timestamptz;
  v_locked_at timestamptz;
  v_team bigint;
  v_team_kickoff timestamptz;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'none');
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  v_game_day := (case when tg_op = 'DELETE' then old.game_day else new.game_day end);
  v_old_game_day := (case when tg_op = 'UPDATE' then old.game_day else null end);
  v_created_at := (case when tg_op = 'INSERT' then coalesce(new.created_at, now()) else old.created_at end);
  v_locked_at := (case when tg_op = 'INSERT' then new.locked_at else old.locked_at end);
  v_team := (case when tg_op = 'DELETE' then old.team_id else new.team_id end);

  select min(f.kickoff_utc) into v_first
  from public.fixtures f
  where f.game_day in (v_game_day, coalesce(v_old_game_day, v_game_day));

  -- before the first kickoff: unlimited edits for everyone
  if v_first is null or now() < v_first then
    return coalesce(new, old);
  end if;

  -- after the first kickoff -------------------------------------------------------
  if tg_op = 'DELETE' then
    return old; -- allow a rebuild to clear the row
  end if;

  if v_locked_at is not null then
    raise exception 'Coach pick is locked — it was saved after the first kickoff'
      using errcode = 'P0001';
  end if;

  if v_created_at is not null and v_created_at < v_first then
    raise exception 'Coach pick is locked — first kickoff on % was at %', v_game_day, v_first
      using errcode = 'P0001';
  end if;

  -- a late entry still open: the picked coach's team must not have kicked off
  select min(f.kickoff_utc) into v_team_kickoff
  from public.fixtures f
  where f.game_day = v_game_day and (f.home_team = v_team or f.away_team = v_team);

  if v_team_kickoff is not null and now() >= v_team_kickoff then
    raise exception 'That coach''s team has already kicked off — pick a team that has not started'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger enforce_coach_pick_lock
  before insert or update or delete on public.coach_picks
  for each row execute function public.enforce_coach_pick_lock();
