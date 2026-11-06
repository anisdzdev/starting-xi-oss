-- Operational tables: poll heartbeat (stale-data banner) + edge invocation counts
-- (free-tier usage guard).

create table public.sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.usage_log (
  fn text not null,
  day date not null,
  count integer not null default 0,
  primary key (fn, day)
);

alter table public.sync_state enable row level security;
alter table public.usage_log enable row level security;

-- readable in-app (stale banner); writes are service-role only
create policy "read sync_state" on public.sync_state for select to authenticated using (true);
create policy "read usage_log" on public.usage_log for select to authenticated using (true);

-- atomic counter for edge functions
create or replace function public.bump_usage(p_fn text)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.usage_log (fn, day, count)
  values (p_fn, (now() at time zone 'America/New_York')::date, 1)
  on conflict (fn, day) do update set count = public.usage_log.count + 1;
$$;
