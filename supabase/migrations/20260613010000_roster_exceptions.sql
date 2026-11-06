-- Superuser late-entry exceptions.
--
-- A superuser (profiles.is_superuser) can grant a per-game-day exception to a
-- user. An exception-holder may build that day's XI AFTER the lock, but only
-- with players whose team has not yet kicked off (enforced in enforce_roster_lock
-- below + mirrored client-side).

-- ---------------------------------------------------------------- superuser flag
alter table public.profiles
  add column if not exists is_superuser boolean not null default false;

-- Bootstrap the known superuser by email (no-op if they haven't signed up yet;
-- handle_new_user below also sets it on future signup, so order doesn't matter).
update public.profiles p
set is_superuser = true
from auth.users u
where u.id = p.id and lower(u.email) = 'admin@example.com';

-- Recreate handle_new_user so a fresh signup with the superuser email is flagged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, is_superuser)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'),
    new.raw_user_meta_data ->> 'avatar_url',
    lower(coalesce(new.email, '')) = 'admin@example.com'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------- helper
-- True when the calling user is a superuser. Security definer so RLS on profiles
-- can't hide the row from the policy check.
create or replace function public.is_superuser()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select p.is_superuser from public.profiles p where p.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------- exceptions table
create table public.roster_exceptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_day date not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_day)
);

alter table public.roster_exceptions enable row level security;

-- Friends-only app: anyone authenticated can read (so the builder + league UI can
-- see who has an exception today).
create policy "read roster_exceptions" on public.roster_exceptions
  for select to authenticated using (true);

-- Only superusers can grant or revoke; granted_by must be the caller.
create policy "superuser insert roster_exceptions" on public.roster_exceptions
  for insert to authenticated
  with check (public.is_superuser() and granted_by = auth.uid());
create policy "superuser delete roster_exceptions" on public.roster_exceptions
  for delete to authenticated
  using (public.is_superuser());

-- Realtime so a grant/revoke flips the recipient's roster tab instantly.
alter publication supabase_realtime add table public.roster_exceptions;

-- ---------------------------------------------------------------- lock trigger
-- Rewrite of enforce_roster_lock (orig: 20260612020000) to honor exceptions.
-- Behavior unchanged for normal users; an exception-holder may write after the
-- lock, but each roster_players row they insert/update must reference a team
-- whose fixture kickoff is still in the future.
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
  v_user uuid;
  v_has_exception boolean;
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

  if tg_table_name = 'rosters' then
    v_game_day := (case when tg_op = 'DELETE' then old.game_day else new.game_day end);
    v_old_game_day := (case when tg_op = 'UPDATE' then old.game_day else null end);
    v_user := (case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  else
    select r.game_day, r.user_id into v_game_day, v_user
    from public.rosters r
    where r.id = (case when tg_op = 'DELETE' then old.roster_id else new.roster_id end);
  end if;

  -- check the target day (and, on updates, the original day so a locked roster
  -- can't be "moved" to an open day)
  select min(f.kickoff_utc) into v_first
  from public.fixtures f
  where f.game_day in (v_game_day, coalesce(v_old_game_day, v_game_day));

  if v_first is not null and now() >= v_first then
    -- Locked. Allow only if this user holds an exception for the target day.
    select exists (
      select 1 from public.roster_exceptions e
      where e.user_id = v_user and e.game_day = v_game_day
    ) into v_has_exception;

    if not v_has_exception then
      raise exception 'XI is locked — first kickoff on % was at %', v_game_day, v_first
        using errcode = 'P0001';
    end if;

    -- Exception path: every NEW/UPDATED roster_players row must be a team that
    -- hasn't kicked off. Deletes are always allowed (rebuilding clears old rows).
    if tg_table_name = 'roster_players' and tg_op in ('INSERT', 'UPDATE') then
      select p.team_id into v_player_team
      from public.players p where p.id = new.player_id;

      select min(f.kickoff_utc) into v_team_kickoff
      from public.fixtures f
      where f.game_day = v_game_day
        and (f.home_team = v_player_team or f.away_team = v_player_team);

      -- NULL means the player's team has no fixture that day; treat as not started — allow.
      if v_team_kickoff is not null and now() >= v_team_kickoff then
        raise exception 'That player''s team has already kicked off — exception picks must be teams that have not started'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
