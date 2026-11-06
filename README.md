# Starting XI

A daily fantasy football app for a private league of friends. Every match day you pick a
starting eleven, follow the matches live as points come in, and climb the standings.
It runs on iOS and the web (as an installable PWA) from one Expo codebase, with Supabase
as the backend.

## Features

- **Roster builder** — pick a formation and fill the pitch from the day's squads; rosters
  lock at kickoff (with superuser late-entry exceptions).
- **Live view** — live scores, minute-by-minute player points, match details sheet, and an
  iOS Live Activity on the lock screen.
- **Standings** — overall, matchday and daily leaderboards with movement indicators.
- **Seasons & rounds** — multiple competitions (e.g. World Cup, Champions League) with
  matchday/round navigation.
- **Competitions** — friends' side bets over a span of rounds, scored by XI points or a
  single player pick.
- **Coach of the Day, tournament picks, scout cards** — extra games on top of the daily XI.
- **Group chat** — real-time chat with replies, read receipts and GIFs.
- **Push notifications** — native (APNs/Expo) and Web Push.

## Stack

| Layer | Choice |
|---|---|
| App | Expo SDK 56, React Native 0.85, React 19, TypeScript (strict) |
| Routing | Expo Router (file-based, typed routes) |
| Styling | NativeWind + Tailwind, design tokens in `src/theme` |
| State | zustand, one store per feature |
| Backend | Supabase: Postgres + RLS, Auth (email OTP), Realtime, Edge Functions (Deno), pg_cron |
| Data | Fixtures, squads and live stats ingested from FotMob by edge functions |
| Tests | Vitest (app + shared logic), SQL tests in `supabase/tests` |

## Project layout

```
app/                 Expo Router routes (thin screens)
src/features/        Feature code: roster, live, leaderboard, competitions, chat, ...
src/shared/          Pure logic shared with edge functions (scoring, game-day rules)
src/components/      Shared UI components
supabase/migrations/ Database schema, RLS policies, views and triggers
supabase/functions/  Edge functions: ingest-fotmob, poll-live, send-push, match-details, ...
targets/widget/      iOS Live Activity widget (Swift)
```

## Getting started

Requires Node 20+.

```bash
npm install
cp .env.example .env    # fill in your Supabase URL + anon key and an invite code
npm run web             # or: npm run ios
```

For a local backend, install the Supabase CLI, run `supabase start`, then seed reference
data with `./scripts/seed.sh local`.

## Checks

```bash
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is built, feature by feature
- [DEPLOYMENT.md](DEPLOYMENT.md) — setting up Supabase, web hosting and iOS builds
- [RUNBOOK.md](RUNBOOK.md) — day-to-day operations and release recipes

## License

[MIT](LICENSE)
