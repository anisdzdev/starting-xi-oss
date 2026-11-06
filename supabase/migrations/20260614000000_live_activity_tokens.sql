-- Live Activities — token + running-activity bookkeeping.
--
-- Two tables back the Apple Live Activity feature (see
-- docs/superpowers/specs/2026-06-14-live-activities-design.md):
--
--   live_activity_push_tokens — one push-to-start token per user per device
--     (iOS 17.2+). The backend uses it to START an activity remotely when a
--     relevant match kicks off.
--   live_activities — one row per running activity, holding the per-activity
--     UPDATE push token (reported by the device after start) and the last
--     content-state (so the END push can reuse the final state).
--
-- Writes happen both from the device (the app registers its own tokens /
-- records a locally-started activity) and from the service role (the
-- live-activity-push edge function flips state + stamps push bookkeeping).
-- service_role bypasses RLS, so only owner policies are declared here.

-- ---------------------------------------------------------------- push-to-start tokens
create table public.live_activity_push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  push_to_start_token text not null,
  env text not null default 'prod' check (env in ('prod', 'sandbox')),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.live_activity_push_tokens enable row level security;

create policy "read own push tokens" on public.live_activity_push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "insert own push tokens" on public.live_activity_push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own push tokens" on public.live_activity_push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own push tokens" on public.live_activity_push_tokens
  for delete to authenticated using (user_id = auth.uid());

create trigger live_activity_push_tokens_set_updated_at
  before update on public.live_activity_push_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- running activities
create table public.live_activities (
  id text primary key, -- ActivityKit activity identifier
  user_id uuid not null references auth.users (id) on delete cascade,
  game_day date not null,
  push_token text, -- per-activity update token; null until the device reports it
  env text not null default 'prod' check (env in ('prod', 'sandbox')),
  state text not null default 'active' check (state in ('active', 'ended')),
  last_content_state jsonb, -- final state reused by the end push
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_pushed_at timestamptz,
  stale_date timestamptz,
  -- set when the user has no relevant live match; the end push fires once this
  -- is older than the grace window (see planLiveActivity). Cleared if a match
  -- becomes relevant again.
  ended_pending_since timestamptz
);

create index live_activities_active_idx on public.live_activities (state)
  where state = 'active';
create index live_activities_user_day_idx on public.live_activities (user_id, game_day);

alter table public.live_activities enable row level security;

create policy "read own activities" on public.live_activities
  for select to authenticated using (user_id = auth.uid());
create policy "insert own activities" on public.live_activities
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own activities" on public.live_activities
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger live_activities_set_updated_at
  before update on public.live_activities
  for each row execute function public.set_updated_at();
