-- Live group chat: ONE global room every authenticated user reads and writes.
--   chat_messages     — the message log (body + mentioned user ids)
--   chat_read_state   — per-user last-seen timestamp, drives the unread tab badge
--   profiles.chat_notifications_enabled — per-user push toggle (default ON:
--     everyone is notified of every message unless they turn it off in the chat)

create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  -- ids of mentioned users (for highlighting; notifications ignore the toggle-off set)
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index chat_messages_created_at_idx on public.chat_messages (created_at desc);

create table public.chat_read_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- Per-user push toggle. Default true → existing rows backfill to true and new
-- signups inherit it, so no handle_new_user change is needed.
alter table public.profiles
  add column chat_notifications_enabled boolean not null default true;

alter table public.chat_messages enable row level security;
alter table public.chat_read_state enable row level security;

-- friends-only league: any signed-in user reads every message; post only as yourself.
create policy "read chat_messages" on public.chat_messages
  for select to authenticated using (true);
create policy "insert own chat_message" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid());

-- read-state is private to each user.
create policy "read own chat_read_state" on public.chat_read_state
  for select to authenticated using (user_id = auth.uid());
create policy "insert own chat_read_state" on public.chat_read_state
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own chat_read_state" on public.chat_read_state
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime: new messages stream to every open chat screen and drive the tab badge.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
