# daily-xi — Going to production

> Companion to [ARCHITECTURE.md](./ARCHITECTURE.md). Keep both updated when infra changes.

_Last updated: 2026-06-11_

## Overview

| Piece | Where it runs | Source |
|---|---|---|
| Postgres + Auth + RLS | Supabase (hosted) | `supabase/migrations/` |
| FotMob ingest | Supabase Edge Function | `supabase/functions/ingest-fotmob/` |
| Daily refresh | pg_cron inside Supabase Postgres | `20260611220000_ingest_fotmob_cron.sql` |
| Web app | Railway (static export of Expo web) | `npx expo export --platform web` → `dist/` |
| iOS app | EAS Build → TestFlight | `eas build` |

## 1. Supabase project

1. Create a project at https://supabase.com/dashboard (pick a region close to users).
2. Link and push the schema from `daily-xi/`:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase db push          # applies everything in supabase/migrations/
   ```
3. **Vault secrets** (used by the pg_cron job at run time) — SQL editor, once:
   ```sql
   select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1', 'edge_base_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```
4. **Configure custom SMTP first** (Project Settings → Auth → SMTP) — the dashboard
   LOCKS email-template editing until custom SMTP is set up ("Set up custom SMTP to
   edit the source"), and the built-in sender is rate-limited to a handful of
   emails/hour anyway. No domain: Brevo free tier (300/day, verified single sender).
   With a domain: Resend (3K/mo free). After saving, bump Auth → Rate Limits → emails.
5. Auth → Email provider stays on. **Edit BOTH the "Magic Link" and "Confirm signup"
   email templates to contain `{{ .Token }}`** (copy supabase/templates/otp_email.html) —
   the app signs in with 6-digit codes, and without the token in the template users
   receive a useless magic link. No redirect URLs are needed for the OTP flow.

## 2. Edge functions (ingest-fotmob, poll-live)

```bash
supabase functions deploy ingest-fotmob
supabase functions deploy poll-live
supabase functions deploy match-details
supabase functions deploy scout-card
supabase functions deploy send-push
supabase functions deploy live-activity-push   # Live Activities (see §9)
```

Seasons (2026-10): `ingest-fotmob`, `poll-live`, `match-details` and `scout-card` read the
`seasons` table (migration `20261014000000_seasons.sql`; `…010000_matchdays` and
`…020000_competitions` ship with it, and `send-push` needs redeploying for the competition
push). **Ship the pieces together, in this order, in one sitting:** (1) `supabase db push`,
(2) redeploy those four functions + `send-push` —
between (1) and (2) the OLD ingest fails (its `onConflict: 'fotmob_id'` no longer matches
the players constraint and `season_id` is NOT NULL), so don't leave it overnight for the
09:00 UTC cron, (3) seed the active season (RUNBOOK → "Start a new season"), (4) ship the
client (web redeploy + `eas update`) — an OLD client reads `overall_leaderboard` unfiltered
and gets one row per user PER season (duplicate names/ranks on the Overall board) until it
updates.

**Deploy with `verify_jwt` ENABLED (the default — do NOT pass `--no-verify-jwt`).** These
functions gate on the JWT `role` claim via `_shared/auth.ts`, which relies on the platform
having validated the signature first (see ARCHITECTURE → service-role auth). The older
"bearer must equal `SUPABASE_SERVICE_ROLE_KEY`" check 401'd every cron call on this project
because the runtime-injected service_role key diverges from the dashboard/Vault key under
the new JWT signing keys — the role-claim check is immune to that divergence.

`send-push` works out of the box for native (Expo Push API). Web Push: a VAPID pair
is already generated — the public key lives in `.env` as `EXPO_PUBLIC_VAPID_KEY`
(set it in Railway/EAS too), the private key in `supabase/functions/.env` locally;
for prod run `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...`.
PWA install + push REQUIRE HTTPS (Railway provides it). After deploy: install the
PWA (Install-app prompt / iOS Add to Home Screen), flip "Match notifications" on,
then test a nudge — the notification should arrive on a locked phone.

`scout-card` needs an OpenAI key (gpt-4o-mini, ~150 output tokens/card, cached per
player/game-day in `scout_cards`):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
# optional override: supabase secrets set SCOUT_MODEL=gpt-4o-mini
```

Local dev: put the key in `supabase/functions/.env` (gitignored) and restart
`supabase functions serve`. Without it, scout generation returns a clear error and
the app shows it; cached cards still serve.

`poll-live` is invoked every 2 minutes by pg_cron but exits immediately (one indexed
query, no external calls) when no fixture is near kickoff — no config needed beyond
the same Vault secrets. It shares the scoring module via
`supabase/functions/_shared/scoring.ts` (synced copy of `src/shared/scoring.ts` —
run `npm run sync:scoring` after editing scoring rules, `npm test` guards drift).

- No extra env needed: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected
  automatically. Optional override: `supabase secrets set FOTMOB_LEAGUE_ID=77`.
- The function rejects any caller whose Bearer token isn't the service role key —
  the anon key can NOT trigger ingest.
- **One-time seed** (all WC2026 fixtures + 48 squads, takes ~1–2 min):
  ```bash
  curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ingest-fotmob" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"mode":"seed"}'
  ```
- Manual daily run (today+tomorrow EST is the default):
  ```bash
  curl -X POST ".../ingest-fotmob" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -d '{"mode":"daily"}'
  ```
- FotMob notes (verified 2026-06-11): JSON lives under `/api/data/*` (the old
  `/api/*` paths return HTML 404s). World Cup league id = **77**. If ingest starts
  failing with 403s, FotMob is gating the API again — check whether requests need
  an `x-mas` token and consider proxying. Player/team images:
  `images.fotmob.com/image_resources/playerimages/<id>.png` and
  `.../logo/teamlogo/<id>.png`.

## 3. Cron (already in migrations)

`ingest-fotmob-daily` runs `0 9 * * *` UTC = **5am US Eastern (EDT)** and posts
today+tomorrow EST dates to the function. Verify after `db push`:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 5; -- after first run
-- pg_net delivery results:
select * from net._http_response order by id desc limit 5;
```

It silently does nothing useful until the two Vault secrets exist (step 1.3).

## 4. Railway (web app)

Railway serves the static web export. Two options; **Dockerfile is the predictable one**:

```dockerfile
# Dockerfile (repo root of daily-xi)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV SUPABASE_URL=$SUPABASE_URL SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
RUN npx expo export --platform web

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":{$PORT}"]
```

Railway setup:
1. New project → Deploy from GitHub repo (or `railway up` from CLI).
2. **Variables**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INVITE_CODE` (anon key only —
   NEVER the service role key; env vars are baked into the client bundle at build time).
   Mark them as build-time variables so the Dockerfile ARGs receive them (add
   `ARG INVITE_CODE` / `ENV INVITE_CODE=$INVITE_CODE` alongside the others).
3. A redeploy is required whenever these values change (bake-at-build).
4. Add a custom domain, then put that domain in the Supabase Auth redirect allowlist.

SPA routing caveat: the export uses Expo Router static output, so each route has its
own HTML file; Caddy's file server handles that. If deep links 404, add a fallback
to `+not-found.html` or switch `web.output` to `single` and serve `index.html` for
all paths.

## 5. iOS (EAS)

```bash
npm i -g eas-cli
eas login && eas build:configure
eas build --platform ios --profile production
eas submit --platform ios
```
- Set `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `INVITE_CODE` as EAS secrets
  (`eas env:create`) so app.config.ts sees them at build time.
- **JS-only releases go over the air** (expo-updates; `updates.url` is declared in
  app.config.ts, runtime version = app version): after a native-free change run
  `npx eas update --channel production --environment production --message "..."`.
  Production builds (channel `production`, runtime `1.0.0`) pick it up on next launch.
  Anything that touches native code or deps still needs `eas build` + TestFlight.
- Push notifications: expo-notifications needs an APNs key uploaded via
  `eas credentials`; store the user's Expo push token in `profiles.expo_push_token`
  (column already exists).
- **Live Activity widget target**: `@bacons/apple-targets` generates the
  `StartingXIActivity` widget extension at prebuild — `eas build` includes it
  automatically (no manual Xcode step). Two provisioning needs:
  - Set `APPLE_TEAM_ID` (EAS env / `.env`) so the extension is signed. EAS will
    create the extension's provisioning profile + a matching App Group
    (`group.com.novem.startingxi`) capability on first build; approve them when
    `eas credentials` prompts (the app AND the widget must share the App Group).
  - Live Activities ship in the same binary; no separate submission.

## 6. Sentry (crash reporting, free tier)

1. Create a project at sentry.io (React Native platform) — free tier: 5K errors/mo.
2. Set the DSN everywhere the app builds: `.env` locally, Railway variables, EAS env —
   `EXPO_PUBLIC_SENTRY_DSN=https://...ingest.sentry.io/...` (reporting is disabled
   anywhere it's unset).
3. Optional, for readable native stack traces: `SENTRY_AUTH_TOKEN` + org/project in
   the EAS build env so the config plugin uploads source maps.

## 7. Usage guard (free tier)

Edge invocations are counted in `usage_log` (per function, per Eastern day):
`select * from usage_log order by day desc, fn;`
Budget at current cron cadence: poll-live (*/2min) ≈ 21.6K/mo, send-push windows
(*/15min) ≈ 2.9K/mo, ingest 1/day, scout-card/nudges user-driven ≈ a few K/mo —
**≈ 28K/mo, ~6% of the 500K/mo free tier**. The poll heartbeat lives in
`sync_state['poll_live']`; the app shows a stale-data banner when it goes quiet
during live matches.

## 8. Pre-launch checklist

- [ ] `supabase db push` ran clean; `cron.job` shows `ingest-fotmob-daily` AND `poll-live-2min` active
- [ ] Both edge functions deployed; `poll-live` returns `{"ok":true,"active":0}` off-hours
- [ ] Vault secrets set (`edge_base_url`, `service_role_key`)
- [ ] Seed run completed for the active season (UCL 26/27: 36 teams, 144 league-phase fixtures, ~950 players)
- [ ] RLS smoke test with the anon key: can read, cannot write reference tables
- [ ] Railway build green, web app loads, auth round-trips
- [ ] `.env` never committed; service role key only lives in Supabase + Vault
- [ ] Auth redirect URLs include the Railway domain and `startingxi://`
- [ ] Live Activities: `live-activity-push` deployed; APNs secrets set (§9); EAS build
      includes the widget + App Group; verified on a device (§9 checklist)

## 9. Apple Live Activities (APNs push)

The Live Activity is push-driven: the backend talks to APNs **directly** (Expo Push
can't drive Live Activities). All pieces are built; this is the one-time setup.

**9.1 Create the APNs Auth Key (.p8) — the hard prerequisite.**
Apple Developer portal → Certificates, IDs & Profiles → **Keys** → ➕ → enable
**Apple Push Notifications service (APNs)** → register → **download the `.p8` ONCE**
(it can't be re-downloaded). Note the **Key ID** (10 chars) and your **Team ID**
(Membership page).

**9.2 Set the function secrets** (the function no-ops gracefully until these exist):

```bash
supabase secrets set \
  APNS_KEY_ID=<APNS_KEY_ID> \
  APNS_TEAM_ID=YOURTEAMID \
  APNS_TOPIC=com.novem.startingxi \
  APNS_AUTH_KEY="$(cat AuthKey_<APNS_KEY_ID>.p8)"   # full PEM, BEGIN/END lines included
```

Local dev: same keys in `supabase/functions/.env`, then restart `supabase functions serve`.
The function signs an ES256 JWT from the key and posts to `api.push.apple.com` (prod) /
`api.sandbox.push.apple.com` (dev builds). The per-device `env` column decides which host.

**9.3 No cron needed.** `poll-live` fire-and-forget invokes `live-activity-push` after
each 2-min cycle (only when fixtures are in the active window). Confirm both are deployed.

**9.4 APNs environment.** Dev/EAS-dev builds register Live Activity tokens with **sandbox**
APNs; TestFlight + App Store use **production**. The app sets the token's `env`
accordingly (`__DEV__ ? 'sandbox' : 'prod'`), and the push targets the matching host —
so a sandbox token from a dev build won't deliver from a prod build and vice-versa.

**9.5 On-device verification** (needs a real device — Live Activities don't work in the
simulator's lock screen / Dynamic Island reliably, and never in Expo Go):

- [ ] Build + install via TestFlight (or `eas build --profile development` + device).
- [ ] First app open: Settings → (app) → **Live Activities** is ON; a row appears in
      `live_activity_push_tokens` for your user (push-to-start token registered).
- [ ] During a live match with ≥1 of your players: the activity appears on the Lock
      Screen even with the app closed (push-to-start), and a `live_activities` row gets
      a `push_token`.
- [ ] A goal/points change updates the Lock Screen + Dynamic Island within ~1 cycle,
      with the number rolling (numericText).
- [ ] 2–3 simultaneous relevant matches → compact multi-match layout; 1 → focused.
- [ ] Player photos + flags render (cached in the App Group); missing → monogram / code.
- [ ] ~10 min after the last relevant match ends, the activity auto-dismisses.
- [ ] Tapping the activity deep-links into the app (`startingxi://live`).
- [ ] `select fn, count from usage_log where fn='live-activity-push' order by day desc;`
      shows invocations during the live window.
