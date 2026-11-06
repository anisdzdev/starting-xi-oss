-- Onboarding state + avatar storage.

-- Profiles get an explicit onboarding marker (the signup trigger fills
-- display_name from the email prefix, so its presence can't be used).
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Public avatars bucket; users may only write inside their own <uid>/ folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
