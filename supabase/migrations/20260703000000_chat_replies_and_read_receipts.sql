-- Chat: read indicators + replies.
--  1) chat_read_state becomes league-readable (from own-row) so we can show who
--     has read how far; writes stay own-row. Added to realtime for live receipts.
--  2) chat_messages gains reply_to_id (self-FK) for message replies.

-- 1) read-state: any signed-in user may READ every row (friends-only league).
drop policy if exists "read own chat_read_state" on public.chat_read_state;
create policy "read chat_read_state" on public.chat_read_state
  for select to authenticated using (true);
-- (insert/update policies are unchanged — a user still writes only their own row.)

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_read_state') then
    alter publication supabase_realtime add table public.chat_read_state;
  end if;
end $$;

-- 2) replies: nullable self-reference; deleting the original nulls the pointer
--    (the reply survives, its quote just disappears).
alter table public.chat_messages
  add column reply_to_id bigint references public.chat_messages (id) on delete set null;
