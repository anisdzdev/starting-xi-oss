-- Chat notifications go from a two-state boolean to a three-state preference:
--   'all'      — notified on every message (default; was enabled = true)
--   'mentions' — notified only when @-mentioned
--   'none'     — never notified (was enabled = false)

alter table public.profiles
  add column chat_notifications text not null default 'all'
    check (chat_notifications in ('all', 'mentions', 'none'));

-- carry the old boolean forward, then drop it
update public.profiles
  set chat_notifications = case when chat_notifications_enabled then 'all' else 'none' end;

alter table public.profiles
  drop column chat_notifications_enabled;
