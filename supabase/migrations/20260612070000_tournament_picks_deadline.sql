-- Tournament picks: switch the permanent lock from "opening match kickoff" to a
-- FIXED deadline at the end of GW1 (the league started late).
--
-- Deadline = 2026-06-18 12:00 ET (16:00 UTC, EDT) — before the second round of
-- group games. Keep this instant in sync with TOURNAMENT_PICKS_DEADLINE in
-- src/features/picks/useTournamentPicks.ts (client lock/UI uses the same value).
--
-- After the deadline NO authenticated writes are allowed — including first inserts.
-- A user who joins the league late simply has no tournament picks (fair: choosing a
-- team AFTER seeing GW1 results would be an unfair advantage). They are not blocked
-- from the rest of the app — the client just shows them a "picks closed" state.

create or replace function public.enforce_tournament_picks_lock()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_deadline constant timestamptz := '2026-06-18T16:00:00Z'; -- Jun 18 2026, 12:00 ET
  v_role text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'none'
  );
  -- Service role / direct connections (system jobs, admin fixes) are exempt.
  if v_role in ('service_role', 'none') then
    return coalesce(new, old);
  end if;

  if now() >= v_deadline then
    raise exception 'Tournament picks are locked — they closed at % (end of GW1).', v_deadline
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

-- Trigger definition unchanged (before insert/update/delete) — recreate for clarity.
drop trigger if exists tournament_picks_enforce_lock on public.tournament_picks;
create trigger tournament_picks_enforce_lock
  before insert or update or delete on public.tournament_picks
  for each row execute function public.enforce_tournament_picks_lock();
