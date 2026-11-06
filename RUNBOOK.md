# daily-xi — Runbook

> Operational recipes. Deploy steps live in [DEPLOYMENT.md](./DEPLOYMENT.md);
> architecture in [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> `$BASE` = `https://<ref>.supabase.co` (or `http://127.0.0.1:54321` locally).
> `$SRK` = service role key. SQL runs in the Supabase SQL editor (or local psql).

## Ship checklist (one-time)

```bash
# 1. Supabase: link, schema, reference data
supabase link --project-ref <REF>
./scripts/seed.sh "$BASE" "$SRK"          # db push + full FotMob seed

# 2. Secrets (see .env.example bottom section)
supabase secrets set OPENAI_API_KEY=sk-... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
# Live Activities (DEPLOYMENT §9 — APNs .p8 from Apple Developer → Keys):
supabase secrets set APNS_KEY_ID=... APNS_TEAM_ID=... APNS_TOPIC=com.novem.startingxi \
  APNS_AUTH_KEY="$(cat AuthKey_XXXXXX.p8)"
# Vault (SQL editor):
#   select vault.create_secret('https://<REF>.supabase.co/functions/v1','edge_base_url');
#   select vault.create_secret('<SRK>','service_role_key');

# 3. Edge functions
supabase functions deploy ingest-fotmob poll-live scout-card send-push live-activity-push

# 4. Web → Railway: new service from this repo (Dockerfile auto-detected).
#    Build-time variables: SUPABASE_URL, SUPABASE_ANON_KEY, INVITE_CODE,
#    EXPO_PUBLIC_VAPID_KEY, EXPO_PUBLIC_SENTRY_DSN.

# 5. iOS → TestFlight (interactive; needs Apple Developer account)
npm i -g eas-cli && eas login
eas credentials   # let EAS manage cert + APNs key (push entitlement is in app.config)
eas env:create    # SUPABASE_URL, SUPABASE_ANON_KEY, INVITE_CODE, EXPO_PUBLIC_* vars
eas build --platform ios --profile preview     # internal distribution
eas submit --platform ios --profile production # TestFlight
```

## Re-seed squads (knockout teams decided, transfers, fixed names)

```bash
# a whole season (idempotent — teams on fotmob_id, players on fotmob_id+season):
curl -X POST "$BASE/functions/v1/ingest-fotmob" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{"mode":"seed","season":"ucl2026"}'
# (omit "season" → the active season)

# just today+tomorrow's teams, for EVERY non-archived season (what the 5am cron runs):
curl -X POST "$BASE/functions/v1/ingest-fotmob" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{"mode":"daily"}'
```

## Start a new season (e.g. next year's Champions League)

Seasons are rows in `seasons` (id, kind nation|club, FotMob league id, inclusive
game-day range, status). Game days must never overlap between seasons.

```sql
-- 1. archive the finished one, add the new one (exactly ONE may be 'active')
update seasons set status = 'archived' where id = 'ucl2026';
insert into seasons (id, name, short_name, kind, fotmob_league_id, starts_on, ends_on, status)
values ('ucl2027', 'Champions League 2027/28', 'UCL 27/28', 'club', 42, '2027-09-07', '2028-06-30', 'active');
```

```bash
# 2. seed it (36 squads ≈ 1 min) — club codes for NEW clubs: add them to
#    supabase/functions/ingest-fotmob/codes.ts CLUB_CODES (else = first 3 letters)
curl -X POST "$BASE/functions/v1/ingest-fotmob" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{"mode":"seed","season":"ucl2027"}'
```

The client reads `seasons` on launch: Standings opens on the active season and lists
the archived ones in its switcher; Home/Roster/Live follow the active one. Tighten
`ends_on` once the final date is known (the Overall board buckets days by the range).

Rounds: `fixtures.matchday` (→ `round_key` md1…md8) is written by ingest, so after
applying migration `20261014010000_matchdays.sql` re-run the season seed once to fill it
for already-ingested fixtures — `select round_key, count(*) from fixtures where
season_id = 'ucl2026' group by 1;` should list md1…md8 (18 each), never a bare `league`.

## Manually trigger a live poll

```bash
curl -X POST "$BASE/functions/v1/poll-live" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{}'
# idle (no match near kickoff) → {"ok":true,"active":0,...}
# heartbeat: select * from sync_state where key = 'poll_live';
```

## Manually trigger a Live Activity push cycle

```bash
# poll-live calls this automatically each cycle; run it directly to debug.
curl -X POST "$BASE/functions/v1/live-activity-push" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{}'
# no APNs creds yet  → {"ok":true,"skipped":"APNs credentials not configured"}
# nothing live        → {"ok":true,"gameDay":"...","actions":0}
# acting              → {"ok":true,"gameDay":"...","start":N,"update":N,"end":N,...}
# running activities:  select id, state, push_token is not null as has_token,
#                        ended_pending_since from live_activities order by started_at desc;
# push-to-start tokens: select user_id, env, updated_at from live_activity_push_tokens;
```

## Void a fixture (postponed/abandoned that the poller missed)

```sql
-- scores void; leaderboards/clean sheets self-correct (they aggregate stats)
update fixtures set status = 'postponed' where fotmob_id = <ID>;
delete from player_match_stats
where fixture_id = (select id from fixtures where fotmob_id = <ID>);
```

## Reset a user's roster for a day

```sql
-- find them
select id, display_name from profiles;
-- nuke the day's roster (direct SQL is exempt from the lock trigger)
delete from rosters where user_id = '<uuid>' and game_day = '<YYYY-MM-DD>';
-- (roster_players cascade-deletes)
```

Reset tournament picks the same way: `delete from tournament_picks where user_id = '<uuid>';`
(only do this BEFORE the opening match, or scores will be misleading).

## Useful queries

```sql
select * from usage_log order by day desc, fn;            -- edge invocation counts
select jobname, schedule, active from cron.job;           -- cron schedules
select * from cron.job_run_details order by start_time desc limit 10;
select * from net._http_response order by id desc limit 5; -- cron HTTP results
select * from daily_leaderboard where game_day = current_date order by rank;
```

## Pre-tournament checklist

- [ ] **Picks lock date**: `select min(kickoff_utc) from fixtures;` = the real opening
      match. Tournament picks + roster lock both derive from kickoff data — verify the
      seed has the right opener before inviting anyone.
- [ ] **Cron**: `select jobname, schedule, active from cron.job;` shows
      `ingest-fotmob-daily` (0 9 * * *), `poll-live-2min` (*/2), `push-windows-15min`
      (*/15) — all active; `net._http_response` shows 200s after first runs.
- [ ] **Vault secrets** set (cron silently does nothing without them).
- [ ] **Push, iOS**: TestFlight build on a real device → allow notifications →
      `select expo_push_token from profiles where id = '<you>';` is non-null → have a
      friend nudge you with the app closed.
- [ ] **Push, PWA**: install from the in-app prompt (Android/desktop) or Add to Home
      Screen (iOS 16.4+ Safari) → toggle Match notifications on →
      `web_push_subscription` non-null → nudge arrives on the locked phone.
- [ ] **Email**: custom SMTP configured; OTP templates contain `{{ .Token }}` (both
      Magic Link AND Confirm signup templates).
- [ ] **Scout cards**: `OPENAI_API_KEY` set; open any player card → report generates.
- [ ] **Usage**: after a match day, `usage_log` totals look like the ~28K/mo budget
      (DEPLOYMENT.md §7).
- [ ] **Sentry**: DSN set in Railway + EAS env; throw a test error and see it arrive.

## Smoke test (two accounts, full loop)

1. Account A builds an XI in the app (picker filters to today's teams), sets captain,
   saves. Account B leaves theirs incomplete.
2. A nudges B from the League tab → B's phone gets "<A> nudged you — first kickoff
   in …" (second tap shows "Nudged" — rate limited).
3. At first kickoff the day locks (UI badge; server trigger rejects edits).
4. During matches: Live tab points tick up (poll-live every 2 min), captain shows
   doubled total, confetti when the captain scores; non-featuring players show DNP
   after FT.
5. Standings reorder live; Daily/Overall movement arrows vs yesterday.
6. Tap a friend on the League tab post-lock → their full pitch.
