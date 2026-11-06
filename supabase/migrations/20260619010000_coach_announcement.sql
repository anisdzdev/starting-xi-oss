-- "What's new: Coach of the Day" one-time announcement.
-- Existing users have seen_coach_announcement_at = NULL → they see the popup once.
-- New signups are stamped now() in handle_new_user so they DON'T see a "what's new"
-- for a feature that already exists for them.

alter table public.profiles
  add column seen_coach_announcement_at timestamptz;

-- Recreate handle_new_user to stamp the announcement as already-seen for new users
-- (supersedes the version in 20260613010000_roster_exceptions.sql).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, is_superuser, seen_coach_announcement_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'),
    new.raw_user_meta_data ->> 'avatar_url',
    lower(coalesce(new.email, '')) = 'admin@example.com',
    now()
  );
  return new;
end;
$$;
