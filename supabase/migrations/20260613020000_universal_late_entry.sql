-- Universal late entry (supersedes the exception-only logic in 20260613010000).
--
-- New rule for EVERYONE:
--   * Before the day's first kickoff: unlimited edits (unchanged).
--   * After the first kickoff:
--       - An "on-time" roster (created before the first kickoff) freezes at kickoff.
--       - A user who missed the deadline (no roster yet) may still build ONE team,
--         but only with players whose team has not yet kicked off. That team locks
--         as soon as it is saved — the client stamps `rosters.locked_at`, after
--         which no further writes are accepted.
--
-- This makes the per-user superuser exception (roster_exceptions) redundant: the
-- trigger no longer consults it, so grants are inert. The table, its RLS, the
-- `is_superuser()` helper and the League grant toggle are intentionally KEPT (they
-- simply have no effect now) rather than reverted.
--
-- `created_at` distinguishes on-time vs late rosters; `locked_at` marks a late team
-- as finalized (one-shot). The locked_at-based RLS policies on rosters/roster_players
-- (which require the parent's locked_at IS NULL) now also help enforce the one-shot,
-- but the trigger is the authoritative rule (it alone freezes on-time rosters, whose
-- locked_at is never set).

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
  v_created_at timestamptz;
  v_locked_at timestamptz;
  v_player_team bigint;
  v_team_kickoff timestamptz;
begin
  -- exempt service role and direct database connections
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'none'
  );
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  -- resolve the target game day + the roster's lifecycle columns
  if tg_table_name = 'rosters' then
    v_game_day := (case when tg_op = 'DELETE' then old.game_day else new.game_day end);
    v_old_game_day := (case when tg_op = 'UPDATE' then old.game_day else null end);
    -- BEFORE INSERT already has column defaults applied (created_at = now()).
    v_created_at := (case when tg_op = 'INSERT' then coalesce(new.created_at, now()) else old.created_at end);
    v_locked_at := (case when tg_op = 'INSERT' then new.locked_at else old.locked_at end);
  else
    select r.game_day, r.created_at, r.locked_at
      into v_game_day, v_created_at, v_locked_at
    from public.rosters r
    where r.id = (case when tg_op = 'DELETE' then old.roster_id else new.roster_id end);
  end if;

  -- first kickoff of the target day (and, on rosters UPDATEs, the original day too,
  -- so a locked roster can't be "moved" onto an open day)
  select min(f.kickoff_utc) into v_first
  from public.fixtures f
  where f.game_day in (v_game_day, coalesce(v_old_game_day, v_game_day));

  -- before the first kickoff: unlimited edits for everyone (unchanged behavior)
  if v_first is null or now() < v_first then
    return coalesce(new, old);
  end if;

  -- AFTER the first kickoff -------------------------------------------------------

  -- finalized late teams never change again (one-shot)
  if v_locked_at is not null then
    raise exception 'XI is locked — it was saved after the first kickoff'
      using errcode = 'P0001';
  end if;

  -- on-time rosters (created before the first kickoff) freeze at kickoff
  if v_created_at is not null and v_created_at < v_first then
    raise exception 'XI is locked — first kickoff on % was at %', v_game_day, v_first
      using errcode = 'P0001';
  end if;

  -- a late entry that is still open: every NEW/UPDATED player must be on a team that
  -- has not yet kicked off (deletes are always allowed so a rebuild can clear rows)
  if tg_table_name = 'roster_players' and tg_op in ('INSERT', 'UPDATE') then
    select p.team_id into v_player_team
    from public.players p where p.id = new.player_id;

    select min(f.kickoff_utc) into v_team_kickoff
    from public.fixtures f
    where f.game_day = v_game_day
      and (f.home_team = v_player_team or f.away_team = v_player_team);

    -- NULL means the player's team has no fixture that day — treat as not started, allow.
    if v_team_kickoff is not null and now() >= v_team_kickoff then
      raise exception 'That player''s team has already kicked off — pick a team that has not started'
        using errcode = 'P0001';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
