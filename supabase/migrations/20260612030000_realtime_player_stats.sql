-- Live points pushes: expose player_match_stats over Supabase Realtime.
-- poll-live upserts rows every 2 minutes during matches; the Live view
-- subscribes filtered to today's fixtures. RLS applies (authenticated read).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'player_match_stats'
  ) then
    alter publication supabase_realtime add table public.player_match_stats;
  end if;
end;
$$;
