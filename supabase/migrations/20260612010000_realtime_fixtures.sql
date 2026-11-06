-- Live score pushes: expose fixtures over Supabase Realtime (postgres_changes).
-- RLS still applies — only authenticated users receive events.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixtures'
  ) then
    alter publication supabase_realtime add table public.fixtures;
  end if;
end;
$$;
