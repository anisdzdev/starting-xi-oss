# daily-xi — Architecture

> **This file is the source of truth for how the app is built.** Read it before making changes,
> and update it when anything described here changes
> (new feature folder, new dependency, changed pattern, new env var, etc.).

_Last updated: 2026-10-14 (+ USER COMPETITIONS (sub-project 3 of 3) — friends' side bets
over a span of rounds. Migration `20261014020000_competitions.sql`: `competitions` (season,
name, reward, `metric` xi|pick, `pick_kind` keeper|player, `from_round`/`to_round` round keys,
creator) + `competition_members` (pk competition+user, `pick_player_id`), RLS (read-all;
create/delete own competition; join/leave/change-pick own row), ONE lock trigger
`enforce_competition_lock()` on both tables (writes only while `now() < first kickoff` of
the span; validates the rounds exist + are ordered, and the pick's season/position/metric;
a member DELETE whose competition is already gone is the cascade of a lock-checked delete
and passes), views `competition_spans` (span dates, first/last kickoff, derived status
open|live|finished) and `competition_standings` (xi = `daily_leaderboard` over the span's
days, pick = `player_match_stats.fpl_points` of the pick over the span's fixtures; every
member listed, rank per competition, pick name/image). `send-push` gained
`{kind:'competition', competition_id}` (creator-only, <60 s; "<creator> started a
competition" to everyone else). Client `src/features/competitions/` (pure `goal.ts` —
`spanLabel`/`goalLabel`/`knockoutSpan`/`seasonSpan`/`isLocked` + vitest; `api.ts`,
`useCompetitions` (focus refetch), `useCompetition` (realtime on stats), `CompetitionCard`
+ `StatusPill`, `SpanPicker` (One matchday / Matchday range / Knockouts / Whole season +
round chips; started rounds disabled), `PickSheet` (wraps `PlayerSearchList`)), screens
`app/(app)/competitions/{index,new,[id]}.tsx` (stack above the tabs), a Home
"Competitions" row, and `BoardRowItem` extracted from the Standings screen
(`src/features/leaderboard/BoardRowItem.tsx`) so competition standings reuse the same row.
VERIFIED locally: migration applied, `competitions.sql` (13 cases: lock before/after,
reversed span, pick kind/season validation, RLS delete, xi + pick standings, cascade) ok;
web: create a keeper-pick competition on Matchday 3 → join with a keeper → standings show
the pick → list shows it under "Open to join"; send-push competition mode exercised via
curl (ok, and "too old" on replay). 194 vitest, typecheck, lint at baseline, web export
clean. **Deploy: db push (3 migrations now) → redeploy send-push too → client.** Deferred:
team picks, winner/reminder pushes, private competitions, editing after creation.
Spec/plan: `docs/superpowers/specs/2026-10-14-competitions-design.md` +
`docs/superpowers/plans/2026-10-14-competitions.md`. **Review fix pass** (fresh reviewer, 5
Important): the trigger now REJECTS changing a member row's `competition_id`/`user_id` (a
losing member could otherwise move their row into an open competition to escape a live one)
and STAMPS `created_at`/`joined_at` server-side (a client-chosen future `created_at` defeated
send-push's "< 60 s" replay check — send-push also rejects a negative age now, chat too);
`competition_standings` sums only the span ROUNDS' own days/fixtures (not a date range, so
a postponed match can't drag other matchdays into "Matchday 3"); `SpanPicker` keeps the
preset in state and compares rounds by list index (md3–md5 is buildable; `'md10' < 'md9'`
string compares are gone); the detail screen's lock follows the server-derived `status`
(no per-mount clock), never `parseISO('')` when a competition's rounds vanished, and the
player-pick sheet lists outfielders only (`PlayerSearchList outfieldOnly`); `competitions.sql`
FAIL branches raise and assert `sqlerrm` (+ join-after-start, pick-UPDATE, membership-move,
created_at-override cases). NOT re-verified in the browser after the fix pass (pane
closed); typecheck + 194 vitest + SQL test green.) +
(+ MATCHDAY FORMAT (sub-project 2 of 3) — the app now has a
**round** unit: a league-phase matchday (its Tuesday + Wednesday) or a knockout stage.
Migration `20261014010000_matchdays.sql`: `fixtures.matchday smallint` (ingest writes it from
FotMob `round` "1".."8" / by-date `tournamentStage`; null in knockouts) + a GENERATED
`fixtures.round_key` (`md<N>` in the league/group phase, else the stage), views
`season_rounds` (per season/round: game-day range + fixture count) and `round_leaderboard`
(`daily_leaderboard` summed over the round's game days, rank per season+round). Client:
`src/features/rounds/` (`roundLabel`/`roundOfDay`/`stepRound`/`defaultRoundFor` pure +
vitest, `loadRounds`, `useRounds(seasonId)`, `RoundStrip`), a shared
`src/components/StepperStrip.tsx` (the DayStrip arrow chrome, now with a `subtitle`) that
`DayStrip` and `RoundStrip` both render. **Standings** gained a **Matchday** board (`BoardKey
'round'`; `useLeaderboard(key, season, { gameDay?, roundKey?, prevRoundKey? })` — options
object replaces the positional day; movement vs the previous round), a `RoundStrip` under the
pills, and the day's round as the DayStrip subtitle; Daily movement is now vs the previous
FIXTURE day (`prevFixtureDay`) and Overall's "before" baseline excludes the latest PLAYED day
(`latestPlayedDay`) — both pure in `leaderboard/movement.ts` + tests — because a club season
mostly has rest days. Home's eyebrow reads `UCL 26/27 · Matchday 3` for the build day; Live's
DayStrip shows the round under the day. XI/lock/coach rules stay per game day; no CL
tournament picks (season-long goals belong to competitions, sub-project 3). Verified on the
local stack: migration applied, `round_leaderboard.sql` ok, CL re-seed populated md1…md8 (18
each), web: Matchday board + round arrows + labels, no console errors; 182 vitest, typecheck,
web export clean. **Deploy: db push → redeploy ingest-fotmob → re-run the seed (fills
matchday) → ship client.** Spec/plan: `docs/superpowers/specs/2026-10-14-matchday-format-design.md`
+ `docs/superpowers/plans/2026-10-14-matchday-format.md`.) +
(+ SEASONS FOUNDATION — the World Cup is over; the app now
runs the **Champions League 2026/27** with the WC archived + browsable. Sub-project 1 of 3
(next: CL matchday format, then user-created competitions). Design: a **date-range
`seasons` table** (`wc2026` archived, `ucl2026` active, one `active` max) and a `season_id`
ONLY where identity collides — `fixtures`, `players` (now unique on `(fotmob_id,
season_id)`: one row per person per season, so Mbappé is a France row for the WC and a
Real Madrid row for the CL; old rosters/stats keep their ids) and `tournament_picks` (PK
user+season). Rosters, coach picks, stats, chat, nudges and `daily_leaderboard` stay
game-day keyed because game days never overlap between seasons. `overall_leaderboard` +
the three pick boards emit `season_id` and rank per season (`team_pick_points(team,
season)`); `fixtures.stage` gains `league`/`playoff`. `ingest-fotmob` is season-driven
(reads `seasons`; `{mode:'seed', season}` / daily covers every non-archived season; club
codes via `codes.ts` `CLUB_CODES` keyed by FotMob team id + CL stage strings via
`stage.ts`, both vitest-tested), `poll-live` + `match-details` resolve FotMob ids within
the fixture's season. Client: `src/features/seasons/` (zustand store loaded in the (app)
layout, `useActiveSeason`, pure `seasonOf.ts`, `SeasonPicker`); **Standings gets a season
switcher** (archived WC boards read-only, pick-board segments only when the season has
picks, `DayStrip` bounded by `from`/`to`), Live's day arrows stop at the active season,
Home's rest-day rail previews the NEXT game day (`useNextGameDayPreview`, CL plays
twice a week) and hides Tournament picks for seasons without them. VERIFIED on the local
stack: `supabase db reset` applied every migration (incl. all the June/July ones that had
never run locally), 4 SQL tests green, and a REAL CL seed via `supabase functions serve`
→ 36 teams / 144 fixtures / 956 players (which caught two bugs: the `/` placeholder rule
dropped Bodø/Glimt, and Shakhtar/Sabah have `squad.squad = null` on FotMob). 163 vitest,
typecheck, lint-at-baseline, web export clean. **Deploy: db push → redeploy ingest-fotmob,
poll-live, match-details → seed ucl2026** (RUNBOOK "Start a new season"). Spec/plan:
`docs/superpowers/specs/2026-10-14-seasons-foundation-design.md` +
`docs/superpowers/plans/2026-10-14-seasons-foundation.md`. **Review fix pass** (fresh
reviewer, 7 Important): `DayStrip` arrows now step to the NEAREST fixture day either side
(pure `dayStep.ts` + tests — a club season is mostly rest days, and an archived season's
range end is a placeholder date, so the old "selected must be in the list" rule left both
arrows dead); the seasons store dedupes loads + flags failures and `useSeasonRetry()`
(Standings) re-fetches, while the Daily board renders WITHOUT a season; `PlayerPicker` +
dev autofill take the build day's `seasonId` (a person has one players row per season —
next year's same club would otherwise list returning players twice); poll-live's coach +
coach-card upserts are BEST-EFFORT (a mid-season manager change collides with the UNIQUE
`coaches.team_id` — must not fail the fixture or trip the stale banner; coach history is a
follow-up); scout-card's prompt reads the player's season name/kind (was hard-coded World
Cup; `club` = nationality in a club season); ingest reports "no squad data" clubs in
`squadFailures`; `scripts/seed.sh` builds valid JSON; DEPLOYMENT documents the ship ORDER
(db push → 4 functions → seed → client, in one sitting — the old ingest/clients break in
between). 168 vitest.) +
Previously 2026-07-03 (+ CHAT READ INDICATORS + REPLIES + ANIMATED TIME — three
additions to the group chat, all verified on web via `/dev/chat`. (1) **Read indicators**
(Messenger group-style): stacked ~14px reader mini-avatars (capped 4 + "+N", `ReaderAvatars.tsx`)
render beneath the last message each member has read — DERIVED from the existing
`chat_read_state.last_read_at`, no new table. Pure `computeReaders(messages, members, readAt,
meId)` (`readers.ts`, +5 vitest) buckets each member (except me) under their high-water message
(newest `created_at ≤ their last_read_at`); `useReadReceipts.ts` loads the read-state map +
realtime. Migration `20260703000000_chat_replies_and_read_receipts.sql` relaxes
`chat_read_state` SELECT from own-row to **authenticated read-all** (friends league) and adds it
to `supabase_realtime`. `chat.tsx` now also stamps `markChatRead` on new messages while focused
so your read position advances live for others. (2) **Replies** (slide-to-reply): same migration
adds nullable `chat_messages.reply_to_id` (self-FK, `on delete set null`). The query selects the
scalar `reply_to_id` and the quote preview (`ChatMessage.replyTo {id, authorName, body, isGif,
gifUrl}`) is resolved CLIENT-SIDE from the loaded messages + members (`replyPreview.ts`, vitest) —
NOT a PostgREST self-embed (that 400'd: self-join + nested profiles is fragile/schema-cache
sensitive; this was a production regression, now fixed). `sendChatMessage`/
`sendChatGif`/`useChat.send`/`sendGif` take an optional `replyToId` (own echo resolves the quote
server-side; realtime inserts with a `reply_to_id` re-fetch via `loadMessage`). `MessageRow` wraps
each row in an RNGH `Gesture.Pan` (rightward drag past 55px → `onReply`, `failOffsetY` yields to
scroll) with a `CornerUpLeft` hint; a reply shows a tappable `ReplyQuote` above its bubble
(author + snippet or "GIF" + thumb), any message type. `ChatComposer` gained a `replyingTo` bar
(+ `onCancelReply`). Tapping the quote jumps to the original (`FlatList` ref + `scrollToIndex` +
`onScrollToIndexFailed`) and plays a shared-value highlight pulse. (3) **Time reveal fix**: the
per-`MessageRow` `showTime` local state was lifted to a single `revealedTimeId` in `chat.tsx`
(tap → set, tap again → clear, tap another → switch; **at most one time visible**), and the caption
now animates via a reanimated shared value (height+opacity, ~160ms) instead of a hard
mount/unmount — deliberately NOT `entering/exiting` (WEB GOTCHA #3: unreliable in FlatList cells on
web). `/dev/chat` extended with a reply, read positions, and time state. typecheck + 135 vitest +
web export clean. Replying to someone now notifies them like a mention: `send-push` chat mode
gained a **"<name> replied to you"** push to the quoted message's author (delivered on `all` OR
`mentions`, deduped so a reply beats a mention beats the plain broadcast). **Apply the migration
+ redeploy `send-push`.** You CAN reply to a reply — the quote is one level deep, so it just
references that reply as a normal message. Spec/plan:
`docs/superpowers/specs/2026-07-03-chat-read-replies-time-design.md` +
`docs/superpowers/plans/2026-07-03-chat-read-replies-time.md`.) +
Previously 2026-07-02 (+ CHAT GIFs → KLIPY + Messenger input anim — Tenor's API was
retired, so GIF search now uses **KLIPY** (`src/features/chat/klipy.ts`, replaces
`tenor.ts`): `GET https://api.klipy.com/api/v1/<KEY>/gifs/{trending,search}?per_page=24&rating=pg-13`
(key is a URL PATH segment), results at `data.data[]`, each with
`files.{sm,md,hd}.gif.{url,width,height}` — grid uses `sm`, the sent message uses `md`/`hd`;
`pickVariant` is defensive and skips ad/non-gif entries. Env renamed
`EXPO_PUBLIC_TENOR_KEY` → `EXPO_PUBLIC_KLIPY_KEY` (`klipyConfigured()` gates the button);
`GifPicker` credit is now "Powered by KLIPY". The stored reference model is unchanged
(url + dims, no bytes). Also **Messenger-style composer**: the "GIF" button collapses away
(reanimated width/opacity/translateX, 190ms) the moment the input has text and springs back
when it's cleared; the row dropped its flex `gap` for animated margins so the collapse is
seamless. typecheck + web export clean; 130 vitest. **Set `EXPO_PUBLIC_KLIPY_KEY`** (klipy.com
partner panel).) +
CHAT GIFs (Discord-style, Tenor) — send GIFs in chat; we
store only a REFERENCE (the Tenor CDN url + width/height), never the bytes. Migration
`20260702020000_chat_gifs.sql` makes `chat_messages.body` nullable, adds
`gif_url`/`gif_width`/`gif_height`, and swaps the body check for a content check (text OR
gif required). `src/features/chat/tenor.ts` calls Tenor v2 DIRECTLY from the client
(`featured`/`search`, `contentfilter=high`, `media_filter=gif,tinygif`) with a bundled
`EXPO_PUBLIC_TENOR_KEY` (rate-limited public key like INVITE_CODE; GIF button hidden when
unset via `tenorConfigured()`). `GifPicker.tsx` = a `BottomSheet` with a debounced search
box + a 2-column masonry grid (ScrollView, tinygif previews, "Powered by Tenor"); tapping
inserts a gif-only message. `ChatComposer` gained a "GIF" button + `onSendGif`; `useChat`
gained `sendGif` (→ `sendChatGif`); `MessageRow` renders the GIF via `expo-image` (animated,
≤200px wide at its aspect ratio) instead of a text bubble. `send-push` chat preview reads
"Sent a GIF" when a message has no text. New env `EXPO_PUBLIC_TENOR_KEY`. typecheck + web
export clean; 130 vitest. **Redeploy send-push** + apply the migration + set the Tenor key.) +
CHAT POLISH — Messenger-style redesign + 3-state
notifications. (1) `MessageRow` moved the author name OUT of the bubble (small, grey, above
it, only on the first of a consecutive group) and dropped the in-bubble time; own messages
are now a solid purple bubble (`accentPurple`), others a grey bubble beside the author
avatar (avatar/name only on group start, grouped messages indent under it). (2) TIME:
`chat.tsx` computes per-message `groupStart` + a centered time divider when the gap since
the previous message exceeds `SILENCE_MS` (1h); tapping any bubble reveals its own send
time beneath it. (`MentionText` gained `baseColor`/`mentionColor` for the colored own
bubble.) (3) NOTIFICATIONS are now 3-state: the boolean `profiles.chat_notifications_enabled`
becomes `profiles.chat_notifications text ('all'|'mentions'|'none')`
(migration `20260702010000_chat_notification_prefs.sql` adds+backfills+drops); the header
bell opens a small menu (All messages / Only mentions / None). `send-push` chat mode splits
recipients: a mentioned user (pref 'all' OR 'mentions') gets a "<name> mentioned you" push,
everyone else on 'all' gets "<name>: <preview>", 'none' gets nothing. (4) COMPOSER input is
compact again (`minHeight 38`, rounded-full, `textAlignVertical:'center'` + explicit
padding so the placeholder centers). Typecheck + web export clean; 130 vitest. **Redeploy
send-push** + apply the new migration.) +
LIVE GROUP CHAT — one global room every user reads/writes,
as the 5th bottom tab (between Table and League). New tables (migration
`20260702000000_chat.sql`): `chat_messages` (`user_id`, `body`, `mentions uuid[]`,
`created_at`; RLS = authenticated read-all + insert-as-self; added to `supabase_realtime`),
`chat_read_state` (per-user `last_read_at`, own-row RLS) for the unread badge, and a new
`profiles.chat_notifications_enabled boolean default true` (per-user push toggle). Feature
lives in `src/features/chat/`: `api.ts` (load members/messages, send, mark-read,
notification pref — the pref is read on its OWN query, NOT the auth-critical session
profile select, so a missing column can't break login, per the coach-announcement lesson),
`useChat.ts` (members + messages + realtime INSERT dedup by id + optimistic send),
`mentions.ts` (PURE, vitest-tested: `findMentionQuery`/`applyMention`/`extractMentions`/
`splitMentions`/`matchMembers`), `ChatComposer.tsx` (input with @-mention autocomplete —
detects the in-progress @-token at the cursor, floats a matching-members list, inserts
`@Name `), `MessageRow.tsx` + `MentionText.tsx` (own vs others bubbles; @-mentions
highlighted, a mention of YOU tinted gold + gold bubble edge), `badge.ts` (zustand unread
store) + `useChatUnread.ts` (watcher mounted in the tab bar). **Tab + badge**: `TabBar`
gained a `chat` key (MessageCircle) + a `badges?: Partial<Record<TabKey,boolean>>` prop
(red dot on the icon); `(tabs)/_layout.tsx` renders a custom `AppTabBar` that calls
`useChatUnreadWatcher()` → `badges={{chat}}`; the badge clears when `chat.tsx` gains focus
(`markChatRead` + store reset). **Notifications**: `send-push` gained a `{kind:'chat',
message_id}` mode (JWT-gated; verifies the message is the caller's and <60s old to prevent
spoof/replay, then delivers "<name>: <preview>" to every profile with
`chat_notifications_enabled` except the sender); the chat screen's top-right bell toggles
that flag. `chat.tsx` is an inverted `FlatList` + composer in a `KeyboardAvoidingView`. Dev
preview: `/dev/chat` (mock data, `__DEV__`). +17 mention vitest (130 total); typecheck +
web export clean. **Redeploy `send-push`** for the chat mode. NOT interactively verified
(auth-gated; Docker off).) +
LINEUP STAT ICONS — FotMob-style marks on the player
bubbles in every 11-player pitch view: a football (goal), a boot (assist) and a shield
(clean sheet) in a bottom-edge badge row (all white glyphs on dark chips), and a GREEN
star top-right for the Man of the Match. Glyphs come from **@expo/vector-icons**'
`MaterialCommunityIcons` (`soccer` / `shoe-cleat` / `shield` / `star`) — a NEW dependency
(`^15.0.2`, added because lucide has no football/boot and the hand-drawn SVGs looked rough).
One shared presentational piece: `src/features/live/PlayerFieldIcons.tsx` (the overlay
cluster, sized to the bubble; must sit inside a NON-clipped relative wrapper — the photo
circle clips its own image, the marks straddle it). Used in BOTH pitch paths.
(1) **Live/team/locked-roster** (`LiveSlot` inside
`LiveRosterView`): `LiveSlot` gained `stats: DbStats | null` + `isMotm` props; marks show
only once the match is live/finished; clean sheet mirrors the scoring gate
(`clean_sheet && minutes>=60 && POINTS.cleanSheet[pos]>0`, so no FWD shields); the captain
"C" badge moved to the top-LEFT so the MVP star can own the top-right. MVP needs FotMob ids:
`useLiveRoster` now selects `players.fotmob_id` → `LiveRosterPlayer.fotmobId`, and
`useGameDay` selects `fixtures.motm_player_id` → `Fixture.motm_player_id` (also merged in the
realtime UPDATE handler); `LiveRosterView` computes `isMotm = fixture.motm_player_id ===
p.fotmobId`. (2) **Home match-sheet** (`LineupPitch` in `MatchSheet`): the `match-details`
edge parser (`parseMatchDetails.ts`) now emits `goals`/`assists` (counted from each
starter's `performance.events`), `cleanSheet` (finished match + team conceded 0, GK/DEF/MID
via `usualPlayingPositionId` 0–2), and `isMotm` (from `content.matchFacts.playerOfTheMatch.id`);
the client mirror `LineupPlayer` (`matchDetails.ts`) + `LineupPitch` render the same overlay.
Roster BUILDER slots (`PlayerSlot`) are pre-match so they get no marks. Dev preview:
`/dev/lineup-icons` (mock data, `__DEV__`-guarded). +5 parser vitest cases (113 total),
typecheck + web export clean. **Redeploy `match-details`** for the new lineup fields.
NOT interactively verified (app is auth-gated; local Supabase Docker off) — the custom boot
SVG in particular should be eyeballed on a device.) +
Previously 2026-06-19 (+ PAST-DAY ROSTER VIEW — tapping a user on a PAST Daily
standings day now opens THAT day's roster, revealed even while today's picks are still
hidden. The Daily board's `Row` (`leaderboard.tsx`) carries a `rowGameDay` (the selected
day, only when it isn't today) → `router.push('/team/<id>?gameDay=<day>')`; other boards /
today link plain (today's gate). `team/[userId].tsx` reads the optional `gameDay` param:
`isPastDay = gameDay < currentGameDay()` bypasses the EyeOff "hidden until kickoff" gate
(`hidden = !isMe && !locked && !isPastDay`), passes `gameDay` + `buildable={false}` to
`LiveRosterView` (so an empty past roster shows "No XI this day", never a Build CTA), and
appends the day (`EEE d`) to the header title. Typecheck clean. Not interactively verified
(auth-gated + Docker off).) +
LEADERBOARD PAST-DAY SELECTOR + LIVE-ACTIVITY BACK BUTTON —
two small fixes. (1) The Standings **Daily** board now has a day selector (reuses
`DayStrip` from `src/features/live/`, shown only on the Daily segment, below the segment
pills): `useLeaderboard(key, gameDay?)` threads an optional `gameDay` (via a `dayRef` for
realtime + a `[key, gameDay]` refetch effect); `fetchBoard` filters `daily_leaderboard` by
the selected day and computes movement vs the **calendar day before the selected day**
(`subDays`), not hardcoded yesterday. `leaderboard.tsx` owns `day` state (defaults to today,
reset to today whenever the Daily segment is re-opened so it never opens stale); other boards
pass `undefined` (query "now") and show no selector. Overall/Team/Player/Keeper unchanged.
(2) Tapping the lock-screen Live Activity (`startingxi://live`) cold-launched the app onto
`/live` with an empty back stack → no back chevron, user stranded. Fix in `app/(app)/_layout.tsx`:
`unstable_settings = { initialRouteName: '(tabs)' }` anchors the stack so Expo Router
synthesizes `(tabs)` beneath any deep-linked screen, AND a `HomeFallbackBack` `headerLeft` on
the `live` screen that `goBack()`s when possible else `router.replace('/(app)/(tabs)')`.
Typecheck clean; web bundle boots with no console errors. Daily-board day-selector not
interactively verified (app is auth-gated + local Supabase Docker off); back-button is iOS
deep-link behavior, verify on next device build.) +
COACH OF THE DAY — a daily side-game folded into the roster
builder. Each game day a user picks one **coach** (a team's manager); the coach scores from
that team's **substitutes** (sub goal +3, sub assist +2, sub Man-of-the-Match +3), the
**match result** (win +5 / draw 0 / loss −3), and the **coach's own cards** (yellow −1, red
−3; FotMob DOES log coach cards — `Card` event with `cardDescription.localizedKey==='coach'`,
`player.id` = the lineup `coach.id`). **Coach points fold into the daily total** —
`daily_leaderboard` is rewritten to add a new `coach_day_points` view (a user appears with a
roster OR a coach pick), so `overall_leaderboard` inherits it; there is NO separate board.
Lock = the day's first kickoff with the SAME universal-late-entry rule as the XI
(`enforce_coach_pick_lock` trigger). New tables `coaches` (FotMob coach id PK, one per team,
ingested), `coach_picks` (daily, PK user+game_day, `locked_at`), `coach_match_stats`
(per coach+fixture yellow/red), + columns `player_match_stats.is_sub` and
`fixtures.motm_player_id`. **poll-live** parser extended (`parseMotm`/`parseCoachCards`/
`parseCoaches` + `isSub` on ParsedPlayer; new `__fixtures__/coach-cards.json`) and its
orchestration now writes `is_sub`, `motm_player_id`, upserts `coaches` + `coach_match_stats`
(**redeploy poll-live**); **ingest-fotmob** upserts each team's coach from the team endpoint
`overview.lastLineupStats.coach` (**redeploy ingest**). Client: `useCoachPick` hook +
`saveCoachPick`/`loadPickableCoaches` (`useCoachPick.ts`), pure `validateCoachPick.ts`
(+ vitest), `CoachPicker`, `CoachPointsBreakdownSheet`, `CoachOfTheDay` (compact section in
the builder), and `CoachLine` (read-only "Coach: <name> · <pts>" on live / team / league).
SQL migrations `20260619000000_coach_of_the_day.sql` + `20260619000100_coach_pick_lock.sql`
**authored but NOT applied locally** (Docker off) — apply at next reset/deploy; SQL tests
`supabase/tests/coach_pick_lock_trigger.sql` + `coach_day_points.sql`. 109 vitest green,
typecheck + web export clean. Known limitation: a user with an on-time XI but no coach can't
late-add a coach (the locked screen shows `LiveRosterView`, not the picker). **One-time
"Coach of the Day is here" announcement** (`src/features/announcements/`): a `BottomSheet`
with a gold-gradient hero (overlapping real coach headshots + flag overlays from the
`coaches` table, monogram fallback), scoring highlights, and a "Pick your coach" CTA → Roster.
Shown once to any onboarded user whose new `profiles.seen_coach_announcement_at` is null
(server-tracked, so once per PERSON across devices — Android/web included); `handle_new_user`
stamps `now()` for new signups so only existing players see it; mounted in `app/(app)/_layout.tsx`.
Migration `20260619010000_coach_announcement.sql` (adds the column + recreates
`handle_new_user`). **The seen-state read is DECOUPLED from the auth-critical profile fetch**
(its own `shouldShowCoachAnnouncement()` query in `announcements/api.ts`): a missing column /
error → the popup just doesn't show, so shipping the client before the migration can't break
login/onboarding. (An earlier version put `seen_coach_announcement_at` in the session profile
select, which bounced users to onboarding when the column was absent — fixed.) Spec+plan:
`docs/superpowers/specs/2026-06-19-coach-of-the-day-design.md` +
`docs/superpowers/plans/2026-06-19-coach-of-the-day.md`.) +
LIVE ACTIVITY TEAM-COLOR BACKGROUND (Apple-Sports look) —
the flat navy bands read bland; now the lock-screen background is tinted from the two
nations' colors like Apple Sports. New `MatchTint` (ActivityViews.swift) = a diagonal
`LinearGradient` of `teamColor(home)`→`teamColor(away)` under a top→bottom black gradient
(0.34→0.74) that darkens for legible white/green/gold text AND makes the lower player band
read darker (band fills removed; `bandTop`/`bandBottom` assets now unused). `teamColor(code)`
+ `Color(rgb:)` (WidgetSupport.swift) map ~50 FIFA codes → primary national colors (deep-slate
fallback). Minute/period text switched from red → white (and `MatchRow` tag → white 70%, `PTS`
→ white 65%) so they survive a red/green tint; the small red live-dot stays. **SwiftUI only —
needs an EAS rebuild.** Any single color is a one-line tweak in `teamColors`. JS untouched
(101 tests green).) +
LIVE ACTIVITY DUPLICATE FIX (one-per-user) — a user had 2
activities. Root cause: the Phase-2 "stale-placeholder retry" re-fired push-to-start every
~8 min whenever the device never confirmed (the per-activity token can only be read while
the app is OPEN, so a closed-app user never confirms) — and push-to-start is NOT idempotent,
so each re-fire spawned ANOTHER activity. Fix: **removed the retry entirely.** `planLiveActivity`
now START only when the user has NO activity at all (placeholder or real); a placeholder
(inserted by the executor only on a successful start push) blocks all further starts until
the device confirms or the match ends. Added **single-activity enforcement**: if the DB ever
shows >1 running activity, keep one deterministically (**max activity id**) and END the rest.
Native module `collapseToSingle()` (LiveActivityModule.swift) applies the SAME max-id rule
on-device — on launch + every `activityUpdates` it ends all but the max-id activity, cleaning
up duplicates a closed-app device accumulated (the existing 2-activity user clears on next app
open). `restartAfterMs` removed; `createdAtMs` kept as informational. **Backend (planner) ships
via redeploy now; the on-device collapse ships with the next EAS build.** Tests 101 green
(planner reworked); typecheck clean.) +
LIVE ACTIVITY UI + MINUTE FIXES (post-device review) — THREE
fixes: (1) **wrong minute** — the widget approximated the clock from kickoff, which overshoots
once halftime/stoppage accrue (showed "90+'" at the 66th min). poll-live now persists FotMob's
real clock via new `liveClockOf()` (parse.ts, normalizes the curly apostrophe) into new column
`fixtures.live_minute` (migration `20260615000000_fixture_live_minute.sql`); `ActivityFixture`
gained optional `liveMinute`, and `buildActivityState` prefers it over `approxMinute`;
`live-activity-push` selects + passes it. **Backend-only — redeploy poll-live + live-activity-push,
db push.** (2) **crowding/cut-off** — dropped the "YOUR XI · LIVE" wordmark; `HeaderBar`→`TotalHeader`
(centered live-dot + total + PTS); BandA/BandB horizontal padding 16→18 and BandB bottom padding
→18 so the player points pill no longer clips the rounded corner. (3) **flag/code misalignment** —
`ScoreboardView.teamColumn` now centers the code UNDER the flag (plain `VStack` + edge-aligned
frame) instead of leading/trailing-aligning both. (2)+(3) are SwiftUI → **need an EAS rebuild.**
Tests 100 green (buildActivityState +1, parse +2); typecheck clean; no dup Swift types.) +
LIVE ACTIVITIES PUSH-TO-START FIX (device-verified) —
push-to-start silently never rendered: `liveactivitiesd` logged `Received start without an
alert configuration` while APNs returned 200 (`start:N`, no failures). **iOS REQUIRES an
`alert` on a push-to-start payload.** Fix: `_shared/apns.ts` `buildApnsRequest` now always
emits `aps.alert` for `event:'start'` (defaults if the caller omits one); `live-activity-push`
passes a real `startAlert(contentState)` ("Your XI is live — CAN 2–1 MAR"). ALSO hardened the
wedge it exposed: the dedup placeholder was inserted unconditionally, so an accepted-but-
unconfirmed start blocked all retries for the whole match. Now the placeholder is inserted
ONLY after a successful start push, and `planLiveActivity` treats a token-less placeholder
older than `restartAfterMs` (8 min) as stale → drops it + re-fires the start (self-heals; old
wedged `start:<user>:<day>` rows auto-recover). `live_activities.started_at` feeds the retry
clock (`createdAtMs`). **Backend-only fix — redeploy `live-activity-push`, no app rebuild.**
Tests 97 green (apns +3, planner reworked); typecheck clean.) +
MATCH DETAILS SHEET — tapping a `FixtureCard` (Home rail +
rest-day preview) now opens a `MatchSheet` (`src/features/live/MatchSheet.tsx`) showing the
FotMob lineup on the shared `Pitch`: confirmed (`lineupType "standard"`) or predicted
(`"lastStarting11"`), a Home/Away team toggle, the user's own picked players ringed in gold,
≤3 FotMob news headline cards (pre/post-review, English only) that open externally, and an
"Open in FotMob" link (`https://www.fotmob.com/match/<id>` universal link → app then site).
Data comes from a new browser-invokable edge function `supabase/functions/match-details`
(CORS + JWT like `scout-card`; proxies FotMob `matchDetails` — the API is CORS-blocked from
the web build; flags "my XI" by reading the caller's roster_players→players.fotmob_id for the
day). Parsing is a PURE vitest-tested module `parseMatchDetails.ts` (mirrors `poll-live/parse.ts`,
7 tests vs 2 real captures in `__fixtures__/`). Client: `useMatchDetails` hook +
`matchDetails.ts` types (mirror of the payload) + `LineupPitch.tsx` (positions dots from FotMob
`verticalLayout` x/y, y INVERTED so GK sits at the bottom goal). Added `fotmob_id` to the client
`Fixture` type + `FIXTURE_SELECT` in BOTH `useGameDay.ts` and `useTomorrowPreview.ts` (the latter
now returns `{ fixtures, gameDay }`). `FixtureCard` takes a new `gameDay` prop. New usage key
`match-details` (user-driven taps, negligible). The function is deploy-verified (Deno; no local
Docker this session) — parser unit-tested + web export green; interactive end-to-end needs the
function deployed to the app's backend. Spec/plan:
`docs/superpowers/specs/2026-06-14-match-details-sheet-design.md` +
`docs/superpowers/plans/2026-06-14-match-details-sheet.md`.) +
APPLE LIVE ACTIVITIES (Phase 6/6 — docs + handoff) — DEPLOYMENT.md
§9 "Apple Live Activities (APNs push)" (create the `.p8` Auth Key, `supabase secrets set`
the four APNS_* vars, sandbox-vs-prod env note, full on-device verification checklist) +
the EAS §5 widget-target/App-Group signing notes + `live-activity-push` added to the deploy
list & pre-launch checklist; RUNBOOK.md gained the APNs secrets in the ship checklist and a
"Manually trigger a Live Activity push cycle" recipe with the DB inspection queries.
**All buildable work (Phases 1–5) is complete + green; remaining is USER-only:** provision
the APNs `.p8` (Phase 7) and run the on-device TestFlight verification. DEFERRED fast-follow:
the iOS 16.2–17.1 local-start fallback (needs a shared client copy of `buildActivityState`).) +
APPLE LIVE ACTIVITIES (Phase 5/6 — native module + app glue) —
local Expo module `modules/live-activity/` (autolink-verified via
`expo-modules-autolinking search`): `ios/LiveActivityModule.swift` exposes `isSupported`,
`areActivitiesEnabled`, `appGroupContainerPath`, `startActivity`/`endActivity` (local
fallback), and emits `onPushToStartToken` (17.2+) + `onActivityPushToken` (per-activity)
via OnStartObserving streams; carries its OWN `@available(iOS 16.2,*)` copy of
`StartingXIAttributes` (ActivityKit matches by unqualified type NAME — MUST stay in sync
with the widget's `_shared` copy + `buildActivityState.ts` JSON). App glue under
`src/features/live-activity/`: `native.ts` (typed `requireOptionalNativeModule('LiveActivity')`
wrapper, no-ops off-iOS), `api.ts` (`upsertPushToStartToken` → `live_activity_push_tokens`
keyed by `getIosIdForVendorAsync`; `upsertActivityToken` → `live_activities` + clears the
`start:<user>:<day>` placeholder; env = `__DEV__?'sandbox':'prod'`), `photoCache.ts`
(downloads the day's player photos + team flags into the App Group via
`expo-file-system/legacy` → `players/<id>.png`/`flags/<CODE>.png`, idempotent/best-effort),
and `useLiveActivityRegistration()` (subscribes to both token streams + warms the cache),
called from `app/(app)/_layout.tsx` next to `registerPushToken`. **DEFERRED:** the iOS
16.2–17.1 local-start fallback — the native `startActivity` exists but the app doesn't
auto-invoke it yet (needs a client-side content-state builder); push-to-start (17.2+) is the
fully-wired primary path. Swift compiles only on an EAS build; token flow + cache verified
on device in Phase 6. typecheck + lint + 84 tests green. Next: Phase 6 = end-to-end
TestFlight pass (needs the Phase 7 APNs .p8) + docs.) +
APPLE LIVE ACTIVITIES (Phase 4/6 — SwiftUI UI) — built the
full Apple-Sports design in the widget target (compiles only in an EAS/prebuild iOS build —
NOT verified on a Mac this session): `WidgetSupport.swift` (App Group image loader
`AppGroup.playerPhoto(id)`/`flag(code)` reading `players/<id>.png` + `flags/<CODE>.png` from
the shared container — widgets have NO network, so missing → monogram/code fallback;
`FlagView`, `CrownBadge`, `PointsPill` with `.contentTransition(.numericText())`,
`positionColor`), `ActivityViews.swift` (`HeaderBar` brand+total, `PlayerBadge` photo+points
pill+captain crown, `PlayerBadgesRow`, `ScoreboardView` with the live minute in the CENTER,
`MatchRow` compact, two tinted bands `BandA`/`BandB`, and `LockScreenView` switching
focused↔multi on `state.layout`), and `StartingXILiveActivity.swift` rewritten — the real
`ActivityConfiguration` lock-screen + Dynamic Island (compactLeading live dot, compactTrailing
+ minimal = total pts, expanded = scoreboard+badges (focused) or match rows (multi)),
`widgetURL(startingxi://live)`, `keylineTint`. Colors come from the target's Assets.xcassets
(emitted by `expo-target.config.js` `colors`). All points roll via numericText. Sanity:
no duplicate Swift types, exactly one `@main`; JS untouched (84 tests, typecheck green).
Next: Phase 5 = the Expo native module (tokens, App Group path, local start/end) + app glue
(`useLiveActivityRegistration`, photo/flag cache, api token upserts).) +
APPLE LIVE ACTIVITIES (Phase 3/6 — native widget scaffolding)
— installed `@bacons/apple-targets` (config plugin, added to `app.config.ts` plugins) and
created the iOS Live Activity widget extension target under `targets/widget/`:
`expo-target.config.js` (type `widget` → auto-links WidgetKit/SwiftUI/ActivityKit/AppIntents,
deploymentTarget 16.2, App Group `group.com.novem.startingxi`, brand `colors` emitted to the
target's Assets.xcassets), `Info.plist` (NSExtensionPointIdentifier widgetkit-extension),
`_shared/StartingXIAttributes.swift` (ActivityAttributes + Codable `ContentState` — keys
MUST match `buildActivityState.ts`'s JSON; `_shared/` links into BOTH the widget and the
main app target so the JS local-start path can build the same type), and a minimal
COMPILING placeholder UI (`StartingXILiveActivity.swift` + `StartingXIWidgetBundle.swift`
`@main`) — the full Apple-Sports design is Phase 4. `app.config.ts` ios now sets
`appleTeamId` (env `APPLE_TEAM_ID`), the `com.apple.security.application-groups` entitlement,
and `NSSupportsLiveActivities: true`. **DESIGN CHANGE from the spec:** flags are NOT bundled
as a 48-image asset catalog — they're cached in the App Group alongside player photos
(Phase 5), with a country-code text fallback (mirrors `FlagBadge`); avoids sourcing 48 PNGs.
VERIFICATION: `npx expo config` evaluates with the plugin/entitlement/infoPlist wired;
typecheck + lint + 84 tests green. The Swift + the actual widget target only compile in an
`expo prebuild`/EAS build (no Mac build run here) — verified on the dev build in Phase 4/6.
New env `APPLE_TEAM_ID` (build-time, in `.env.example`). Next: Phase 4 = the SwiftUI UI.) +
APPLE LIVE ACTIVITIES (Phase 2/6 — push orchestration,
still no native) — `supabase/functions/_shared/planLiveActivity.ts` (PURE, vitest-tested:
decides start/update/end/grace actions per user — START needs a relevant live match + a
push-to-start token + no existing activity row, and also inserts a placeholder row
`start:<user>:<day>` so the next cycle doesn't double-start; UPDATE for every activity row
that has a per-activity token; END marks `ended_pending_since` then fires only after a
~10min grace, cleared if a match becomes relevant again; token-less placeholders are
dropped after grace) + edge function `live-activity-push` (service-role-gated, default
`verify_jwt=true`; gathers the day's fixtures+rosters+`player_day_points`+tokens+running
activities → `buildActivityState` per user → `planLiveActivity` → executes APNs pushes +
DB bookkeeping; skips an UPDATE push when the content-state is byte-identical to the last;
NO-OPS gracefully when APNs creds are absent so it's safe to ship before the .p8 exists).
`poll-live` now fire-and-forget invokes `live-activity-push` after each cycle (best-effort,
only when fixtures are in the active window). Added column `live_activities.ended_pending_since`
to the Phase-1 migration (unapplied, so amended in place). NEW FUNCTION SECRETS (Phase 7,
not yet set): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (.p8 PEM), `APNS_TOPIC`
(=com.novem.startingxi). Tests green (11 new, 84 total); typecheck clean; Deno not installed
locally so the function is deploy-verified. Next: Phase 3 = native widget scaffolding
(`@bacons/apple-targets`).) + APPLE LIVE ACTIVITIES (Phase 1/6 — backend foundations,
no native yet) — design+impl spec at `docs/superpowers/specs/2026-06-14-live-activities-design.md`.
ONE adaptive push-driven Live Activity per user: 0 relevant live matches → none, 1 →
focused single-match layout, 2–3 → compact multi-match; auto push-to-start on relevant
kickoff + auto-end ~10min after the last finishes. Phase 1 shipped: `supabase/functions/
_shared/buildActivityState.ts` (PURE, vitest-tested — roster + player_match_stats +
fixtures → ≤4KB `ContentState`; captain ×2 applied here like the leaderboard views; total
is the whole-day total incl. finished matches; `players` capped to 6 top scorers; approx
live minute from kickoff since the DB stores none) + `_shared/apns.ts` (PURE Web-Crypto
ES256 JWT signing of the `.p8` APNs Auth Key + `buildApnsRequest` for `liveactivity`
start/update/end pushes — Live Activity pushes CANNOT use Expo Push, must hit APNs direct)
+ migration `20260614000000_live_activity_tokens.sql` (tables `live_activity_push_tokens`
[push-to-start, per user/device] + `live_activities` [running activity + per-activity
update token + last_content_state for the end push], owner-only RLS, service_role bypasses).
NOTE: migration NOT applied locally (Docker intentionally off) — verify on next db reset/
deploy. Tests green (20 new, 73 total); typecheck clean. Next: Phase 2 = `live-activity-push`
edge fn + poll-live wiring. APNs `.p8` key is a user-provided prerequisite (Phase 7).) +
COUNT-UP FIXED DURATION — `useCountUpTotal`
(`src/features/live/useCountUpTotal.ts`) no longer steps ±1 every 70ms (which made big
totals crawl); it now animates from the current value to the target over a FIXED ~850ms
with an ease-out cubic via `requestAnimationFrame`, so the team total always lands in the
same time — a bigger jump just counts faster. Handles up/down and re-targets mid-flight;
first render still shows the target with no count-up. The per-chip `useCountUp` in
`LiveSlot` is unchanged (small deltas).) + LIVE DAY-SELECTOR REWORK — replaced the broken horizontal
pill `DayStrip` (a flex-column `ScrollView` stretched the pills into full-height vertical
bars) with a centered label + prev/next chevron arrows; days now sort ascending so left =
older / right = newer, labels are relative (Today/Yesterday/Tomorrow else `EEE d`), arrows
disable at the ends. `LiveRosterView` gained a `buildable` prop — the live screen passes
`day === today` so the "no XI" empty state only shows the Build CTA for the current day;
past days show a static "No XI this day" message. See the Live view section.)
+ Previously 2026-06-13 (+ UNIVERSAL LATE ENTRY — the superuser-only exception is now
the default for EVERYONE (migration `20260613020000_universal_late_entry.sql` rewrites
`enforce_roster_lock()`): anyone who misses the day's first kickoff can still build ONE
XI, restricted to teams that haven't kicked off, and it locks the moment it's saved
(`saveRoster(..., finalize)` stamps `rosters.locked_at`; the trigger + RLS reject further
writes). On-time rosters (created before the first kickoff) freeze at kickoff as before.
The trigger distinguishes the two via `rosters.created_at` (< first kickoff = on-time =
frozen; ≥ = late = one build) and `locked_at` (set = finalized). `RosterScreen`: `locked
= firstKickoffPassed && hasSaved` → `LiveRosterView`; `lateBuild = firstKickoffPassed &&
!hasSaved` → editable `PitchView` (renamed `exception` prop → `lateBuild`) with
`eligibleTeams`/`startedTeamCodes`, `onSaved` flips to locked; `LatecomerState` now only
shows when EVERY team has already kicked off (nothing left to pick). **The `roster_exceptions`
table, `is_superuser()`, the `useMyException` hook + the League `ExceptionToggle` are KEPT
but now inert** — the trigger no longer consults exceptions. Test: `supabase/tests/
roster_universal_lock_trigger.sql` (replaces the exceptions trigger test). NOTE: the SQL
migration was authored but NOT applied/verified against the local stack this session —
verify on next `supabase db reset` / deploy.) + HOME/STANDINGS POLISH 2 (2026-06-14) —
Standings segment pills now scroll edge-to-edge using the same negative-`marginHorizontal`
breakout pattern as the Home matches rail (`app/(app)/(tabs)/leaderboard.tsx`); + fixed a
device-only seam below the Home content: the Home `Screen` used `edges={['top','bottom']}`
while every other tab screen uses `edges={['top']}`, so its extra
`paddingBottom: insets.bottom` left a `bg`-colored strip above the `surface` `TabBar`
(the tab bar already owns the bottom safe area). Home is now `edges={['top']}`. + HOME POLISH — removed the `border-t` divider above the
`TabBar` (cosmetic, `src/components/TabBar.tsx`); the Home "Matches" rail now scrolls
edge-to-edge by breaking out of the screen's 24px horizontal padding (negative
`marginHorizontal: -spacing.xl` on the rail `ScrollView` + matching
`contentContainerStyle` `paddingHorizontal` so the first card still aligns,
`app/(app)/(tabs)/index.tsx`); `XIStatusCard` CTA copy is now state-aware — building
shows "Make changes" once 11/11 are picked (else "Finish your XI"), and the locked card
shows "View your XI" when nothing is live (else "Watch live").) + LEAGUE TAB OVERLAP FIX — the 2-col League grid broke
intermittently on iOS (cards/rows overlapping, content floating centered) because the
`numColumns` FlatList cells carried a per-cell reanimated `entering` (FadeInDown);
layout-entering animations on a multi-column FlatList detach the cell from flow and
collapse the row, and the hook's realtime-driven refetch replayed the animation
mid-flight. Fixed by replacing the `numColumns` FlatList with a plain `ScrollView` +
flex-wrap grid of 50%-width cells in `app/(app)/(tabs)/league.tsx` — keeps the staggered
`FadeInDown` entrance on native (transforms on a normal-flow flex child never affect
layout) without the column-wrapper that caused the detach. Stable `key`s mean the
entrance plays once on mount and does NOT replay on realtime refetches. See WEB GOTCHA
#3.) + LIVE SCORING FIX — FotMob omits the per-player
`Minutes played` stat until a match is FINISHED, so `parsePlayers` skipped every
on-pitch player during live play (`minutes <= 0` → no rows) and live matches showed
0 points until full time; fixed by approximating minutes from the match clock
(`liveMinuteOf` reads `header.status.liveTime`) when minutes are absent but the player
has populated live stats. Parsing extracted to `supabase/functions/poll-live/parse.ts`
+ regression test against a real captured live response. **poll-live must be redeployed.**
+ Home countdown & `dayStarted` now key off the build day's FIRST-kickoff lock (min
kickoff over ALL fixtures), NOT "no scheduled matches remain" — so once locked the
countdown reads "Next match in" and the XI card shows Locked/Watch-live, not "Finish
your XI"; + superuser late-entry exceptions — `roster_exceptions` table + `profiles.is_superuser`; `enforce_roster_lock()` rewritten to allow exception-holders to save after lock if the targeted players' teams haven't kicked off yet; `useMyException` hook (realtime); `RosterScreen` routes exception-holders into editable `PitchView` post-lock with `eligibleTeams` filtered to future kickoffs (30s tick) and `startedTeamCodes` passed to `validateRoster`; `validateRoster` extracted to `src/features/roster/validateRoster.ts`; superuser-only `ExceptionToggle` in the League tab; `grantException`/`revokeException` in `src/features/league/exceptions.ts`; SQL + vitest tests)_
_Previously: 2026-06-13 (+ roster tab shows the LIVE XI once locked — `RosterScreen`
now renders `LiveRosterView` for the build day when the roster is locked & one was
saved (same view league members see); a locked day with NO saved XI shows a friendly
`LatecomerState` over the pitch (no formation picker, no empty "+" slots); + tiny team
flag next to player names on `LiveSlot` and `PlayerSlot` (flag_url added to the
useLiveRoster query + `LiveRosterPlayer.flagUrl`); + `Pitch` now clips only the grass,
NOT the slot overlay, so a bottom-line GK's points/name pill no longer gets cut off; +
stack back button set to `headerBackButtonDisplayMode: 'minimal'` so pushed screens
show a bare chevron instead of the raw "(tabs)" group name; + scoring explainer — `ScoringRulesSheet` + self-contained `ScoringInfoButton` (icon/link variants) in src/components, values read straight from `POINTS`/`CAPTAIN_MULTIPLIER` in src/shared/scoring.ts so they can't drift; surfaced as an (i) icon on the Standings header, Live top bar and Build-XI header, and as a "View all scoring rules" link in `PointsBreakdownSheet`; + iOS home-screen name fix — `app.config.ts` `name` was the slug `starting-xi`; set to display name `Starting XI` so `CFBundleDisplayName` reads correctly. `slug` stays `starting-xi`; + game-day 6am ET cutoff — a game day runs until 6am ET, so late games up to ~2am ET belong to the prior evening; `gameDayOf` in src/shared/gameday.ts, recompute migration 20260613000000_gameday_cutoff; + CORS handling on browser-invoked edge functions — `_shared/cors.ts`, OPTIONS short-circuit + headers on scout-card & send-push; fixes "Failed to send a request to the Edge Function")_

## What this app is

A daily fantasy football ("Starting XI") mobile + web app. Users pick a roster, follow live
matches, climb leaderboards, and scout players. Backend is Supabase.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Expo SDK 56, React Native 0.85, React 19.2 | TypeScript strict, React Compiler enabled |
| Routing | Expo Router v56 (file-based, typed routes) | Routes in root `app/` |
| Styling | NativeWind v4 + Tailwind 3.4 | Tokens from `src/theme/tokens.js` — see Theming |
| Animation | react-native-reanimated 4 (worklets plugin auto-added by babel-preset-expo) | |
| Images | expo-image | |
| Icons | lucide-react-native (needs react-native-svg, installed); @expo/vector-icons MaterialCommunityIcons for sport glyphs lucide lacks (football/boot) | |
| Backend | Supabase (`@supabase/supabase-js`) | Auth storage: AsyncStorage on native |
| State | zustand | One store per feature, colocated in `src/features/<feature>/` |
| Dates | date-fns + date-fns-tz | Match kickoffs are timezone-sensitive — always use date-fns-tz for display |
| Notifications | expo-notifications | Config plugin registered in app.config.ts |

## Folder structure

```
app/                  # Expo Router routes ONLY — thin screens that compose feature code
  _layout.tsx         # Root stack, dark nav theme, imports global.css
  index.tsx           # Home
src/
  components/         # Shared, feature-agnostic UI components
  features/           # Domain logic, one folder per feature
    roster/           # Squad building & management
    live/             # Live match tracking / scoring
    leaderboard/      # Rankings
    picks/            # Daily picks / transfers
    scout/            # Player discovery & stats
  lib/
    env.ts            # Typed access to expo-constants extra — ALWAYS read env through this
    supabase.ts       # Lazy singleton client via getSupabase()
    api.ts            # Data-access helpers; components never import supabase-js directly
  theme/
    tokens.js         # Design tokens (CJS — shared by tailwind.config.js AND runtime)
    index.ts          # Typed re-export: import { colors, spacing } from '@/theme'
global.css            # Tailwind directives (NativeWind input, see metro.config.js)
app.config.ts         # Dynamic Expo config — env vars land in `extra` here
```

**Path alias:** `@/*` → `./src/*` (tsconfig). Routes import feature code via `@/features/...`.

### Conventions

- **Screens in `app/` stay thin.** They wire routes to feature components. Business logic,
  stores, and feature-specific components live in `src/features/<feature>/`.
- **Data access goes through `src/lib/api.ts`** (or feature api files that build on it).
  Components never call `createClient`/`getSupabase` directly.
- **Zustand stores** live next to their feature (e.g. `src/features/roster/store.ts`).

## Theming (dark-first, WC26 palette)

- `src/theme/tokens.js` is the **theme sheet and single source of truth**:
  `themes.dark` / `themes.light` hold every semantic color; `wc` is the raw FIFA World
  Cup 26-inspired accent palette (purple/blue/cyan/lime/pink/red/orange/gold);
  `gradients` (pitch/hype/live/sunset/gold) feed Screen glows and hero surfaces;
  plus 4pt spacing, radii, type scale, and `layout` (`webMaxWidth: 480` — the
  phone-column width on desktop web).
- `tailwind.config.js` requires that file, so Tailwind classes and runtime values never
  drift: `bg-bg`, `text-textMuted`, `p-lg`, `rounded-xl`, `text-2xl` all come from tokens.
- Runtime access: `useThemeColors()` from `@/theme` (returns dark today; light mode later
  = make it scheme-aware + NativeWind variant strategy — components won't change because
  they only use semantic names).
- **Never hardcode hex colors or pixel values in components.** Add a token first.
- **Zero emojis anywhere in UI — lucide-react-native icons only.**

## Component library (src/components — see /dev/components gallery)

`Screen` (safe-area + animated SVG **radial** glow: hype/pitch/live — `react-native-svg`
RadialGradient fading to transparent at the edge so it feathers into the bg like a
spotlight; a LinearGradient clipped to a circle read as a hard-edged moving disc),
`Card` (glass/elevated),
`Button` (primary/ghost/danger, pressed-scale spring), `TextField` (label + per-field
error; border states: error red > focused cyan > filled green > default — driven by an
explicit style value, see the className-swap gotcha below; the browser's own focus ring
is suppressed with a concrete `outlineStyle`, since 'auto' makes Chrome draw it
regardless of width; fontSize is set via `style` NOT the `text-base` class — that class
also sets lineHeight 24, and a lineHeight taller than the font makes iOS render
single-line TextInput text low/bottom-aligned),
`Avatar` (image or initials, captain/live/primary rings), `StatChip` (lucide icon + tones), `CountdownTimer`
(animated digit roll), `TabBar` (Home/Shirt/Trophy/Users/User, active pill + bounce),
`BottomSheet` (custom — spring open, drag-to-dismiss, no gorhom; on web the `Modal`
portals to the document root OUTSIDE the `PhoneFrame`, so the sheet is capped to
`layout.webMaxWidth` and centered via `marginHorizontal:'auto'` — web-only, native stays
full-width), `Skeleton`/`SkeletonRow`
(gradient shimmer), `EmptyState` (icon or illustration slot + action slot),
`ScoringRulesSheet` (friendly "How points work" bottom sheet; point values come
straight from `POINTS`/`CAPTAIN_MULTIPLIER` in `@/shared/scoring` so they never
drift) + `ScoringInfoButton` (self-contained trigger owning its open state;
`variant="icon"` round (i) or `variant="link"` text link — used on the Standings
header, Live top bar, Build-XI header, and inside `PointsBreakdownSheet`).
Import via `@/components` barrel. `GestureHandlerRootView` wraps the root layout.

**CRITICAL gotcha (cost a debugging round): NativeWind `className` is NOT processed on
reanimated components** (`Animated.View/Text`, `createAnimatedComponent(...)`) — styles
silently no-op. Anything animated takes explicit `style` objects built from `@/theme`
values. Plain RN components keep using className.

**Related gotcha (also cost a round): state-driven className SWAPS are unreliable on
web** — changing a TextInput's className (e.g. `border-border` → `border-primary` on
focus) APPENDS the new class without removing the old one, so whichever rule sits later
in the generated CSS wins and stale colors stick. Any style that changes with component
state goes in explicit `style` values from `@/theme`; className is for static styling
only.

**Dev gallery**: `/dev/components` (app/dev/components.tsx) renders every component and
state; route exists only when `__DEV__` (guarded in root layout). Eyeball it on web AND
iOS after touching any shared component.

## Environment variables

- `.env` (gitignored) → loaded by `dotenv` in `app.config.ts` → exposed via `extra`
  → read at runtime through `src/lib/env.ts` (`getEnv()` throws a clear error if missing).
- Current vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INVITE_CODE`, plus client-visible
  `EXPO_PUBLIC_*` (`EXPO_PUBLIC_VAPID_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_KLIPY_KEY`
  for chat GIFs). Template: `.env.example`.
- `.env` currently points at the LOCAL Supabase stack (127.0.0.1:54321, demo keys) —
  switch to the hosted project's values when it exists.
- Env values are baked in at bundle time — **restart the dev server after editing `.env`**.
- Adding a var: `.env.example` → `app.config.ts` `extra` → the `Extra` type in
  `src/lib/env.ts` → document it here.

## Build & config notes (hard-won, don't re-derive)

- **app.json was deleted** — all config lives in `app.config.ts`. Don't recreate app.json.
- NativeWind v4 needs **Tailwind 3.4** (not v4) and three wiring points: babel preset
  (`jsxImportSource: 'nativewind'` + `nativewind/babel`), `withNativeWind` in
  metro.config.js, and `nativewind-env.d.ts`.
- Reanimated 4 uses `react-native-worklets`; its babel plugin is added automatically by
  `babel-preset-expo` — do **not** add `react-native-reanimated/plugin` manually.
- `DarkTheme`/`ThemeProvider` are imported from `expo-router` (no direct
  `@react-navigation/native` dependency in the SDK 56 template).
- `getSupabase()` is a lazy singleton so module import never throws during web static
  rendering or on checkouts without `.env`.
- Web uses static output (`web.output: "static"`); avoid touching `window` at module scope.
- `css.d.ts` declares `*.css` modules so the `global.css` side-effect import typechecks.

## Seasons (migration `20261014000000_seasons.sql`)

The app runs one competition at a time; finished ones stay browsable. A season is a
**date range** plus a FotMob league id:

| column | notes |
|---|---|
| `id` | `wc2026`, `ucl2026` (text PK) |
| `kind` | `nation` \| `club` — team-code strategy (`FIFA_CODES` vs `CLUB_CODES`), stage inference, copy |
| `fotmob_league_id` | 77 World Cup, 42 Champions League |
| `starts_on` / `ends_on` | inclusive game-day range; **ranges never overlap** (that's what lets everything game-day keyed stay season-free) |
| `status` | `upcoming` \| `active` \| `archived` — partial unique index: at most ONE active |
| `has_tournament_picks` | the Tournament-picks side game exists (WC yes, UCL no) |

`season_of_day(date)` returns the containing season (null in a gap). Read-all RLS, no user
writes. Where `season_id` lives: `fixtures` (not null, index `(season_id, game_day)`),
`players` (not null; **unique `(fotmob_id, season_id)`** — a players row = one person's
registration in one season, so the same FotMob id exists once per season under a different
team; rosters/stats/scout cards reference the internal id and are untouched), and
`tournament_picks` (default `wc2026`, PK `(user_id, season_id)`). `teams` carry no season
(clubs are simply new rows with their own FotMob ids; `code` = 3-letter club code).
`players.club` keeps FotMob `cname` — the club for a nation season, the NATIONALITY for a
club season (the picker's secondary line either way).

**Views**: `overall_leaderboard` joins `daily_leaderboard` to `seasons` by date range →
`season_id` + rank partitioned per season; `team/player/keeper_pick_leaderboard` carry
`season_id` from the pick (rank per season); `team_pick_points(team_id, season_id)` counts
only that season's fixtures (`league` scores like `group`). `daily_leaderboard`,
`coach_day_points`, `player_day_points`, the lock triggers, chat and nudges are unchanged.

**Backend**: `ingest-fotmob` loads `seasons` each run (see its section); `poll-live`
selects `fixtures.season_id` and scopes the FotMob-id → `players` lookup to it;
`match-details` looks up the fixture's season for its points map (unscoped fallback).

**Client** (`src/features/seasons/`): `types.ts` (`Season`), `api.ts` (`loadSeasons`),
`store.ts` (zustand; `load()` once from `app/(app)/_layout.tsx`, deduped in-flight, sets
`failed` when nothing loaded; `useSeasonRetry()` re-fetches from screens that need
seasons; `useSeasons()`, `useActiveSeason()` = active else newest, **null until loaded —
consumers treat null as loading**, and the Daily board works without one), pure
`seasonOf.ts` (`pickActiveSeason`, `seasonOfDay`, `defaultDayFor`, vitest),
`SeasonPicker.tsx` (chip → `BottomSheet` list with Live/Archived/Upcoming). The roster
builder passes `seasonOfDay(seasons, buildDay)` to `PlayerPicker` so only that season's
player rows are listed.
Where it's used: Standings season switcher (archive = option A, the WC lives there; see
Trophy tab), Live `DayStrip from=season.startsOn`, Home + League + picks gating on
`hasTournamentPicks`. Not season-aware by design: Roster/Live/Chat/League (always "now").

**Later** (not in this sub-project): a `round`/matchday column + grouping (sub-project 2),
CL tournament picks, user competitions (sub-project 3), club colours in the Live Activity
(Swift `teamColors` falls back to slate for club codes), overlapping competitions in one
week (would need per-fixture point attribution for Overall).

**Tests**: `seasonOf.test.ts`, `ingest-fotmob/codes.test.ts` + `stage.test.ts`, SQL
`supabase/tests/seasons_overall_leaderboard.sql`; the older SQL tests insert `season_id`.

## User competitions (migration `20261014020000_competitions.sql`)

Side bets between friends: a **metric** over a **span of rounds** with a free-text
**reward**. Anyone creates, everyone sees, anyone joins — only BEFORE the span's first
kickoff (no joining with hindsight). Nobody builds a separate team: standings derive from
points people already earn or from one pick each member nominates.

- **Metrics**: `xi` = your `daily_leaderboard` totals over the span's game days; `pick` =
  one nominated player's `fpl_points` over the span's fixtures (`pick_kind` `keeper` must
  be a GK, `player` an outfielder; the pick must be that season's `players` row). Team
  picks are deferred.
- **Span**: `from_round`/`to_round` are `season_rounds` keys; days = `from.starts_on` →
  `to.ends_on`. Presets in the UI: one matchday, a matchday range, the knockouts (every
  non-matchday round), the whole season.
- **Lifecycle** (derived in `competition_spans`, never stored): `open` until the first
  kickoff → `live` → `finished` once no fixture in the span is scheduled/live. The detail
  screen shows the rank-1 member(s) as the winner once finished.
- **Lock**: `enforce_competition_lock()` (both tables, service role exempt) — all
  authenticated writes rejected once the span has started; the competitions trigger also
  validates the rounds (exist, `from.starts_on ≤ to.starts_on`) and stamps `created_at`
  (server-owned: send-push's replay check depends on it); the members trigger validates the
  pick on INSERT and UPDATE, stamps `joined_at`, and rejects any change to
  `competition_id`/`user_id` (no moving a membership out of a live competition). Creator
  deletes (RLS) cascade members; a member delete whose parent is already gone is that
  cascade and passes.
- **Standings scope**: the rounds IN the span = every `season_rounds` row whose
  `starts_on` lies between the from/to rounds' starts; xi sums `daily_leaderboard` over
  those rounds' own game days, pick sums the pick's `fpl_points` over those rounds' own
  fixtures — never a date range (a postponed match stretches a round's `ends_on`).
- **RLS**: read-all; `competitions` insert/delete as `created_by = auth.uid()` (no update —
  delete + recreate); `competition_members` insert/update/delete own row.
- **Push**: `send-push` `{kind:'competition', competition_id}` — creator-only, <60 s old;
  "<creator> started a competition" / "<name> · <goal> · <span> — join before <ET time>"
  to everyone else. Fired best-effort by `createCompetition`.
- **Client** `src/features/competitions/`: `types.ts`; pure `goal.ts` (relative imports —
  vitest has no path alias): `spanLabel`, `goalLabel`, `knockoutSpan`, `seasonSpan`,
  `isLocked`; `api.ts` (`loadCompetitions(seasonId)` = rows + spans + my membership,
  `loadCompetition(id)` + standings, `createCompetition` → push, `joinCompetition(id,
  pick)`, `setPick`, `leaveCompetition`, `deleteCompetition`); `useCompetitions` (refetch
  on screen focus via `useFocusEffect` + pull-to-refresh), `useCompetition` (realtime on
  `player_match_stats`, debounced); `CompetitionCard`/`StatusPill`, `SpanPicker`,
  `PickSheet`. Screens `app/(app)/competitions/index.tsx` (Open / In play / Finished
  sections, "+ New"), `new.tsx` (name, goal cards, `SpanPicker` with started rounds
  disabled, reward), `[id].tsx` (header, winner banner, Join / Change pick / Leave /
  Delete while open, standings via `BoardRowItem`). Home has a "Competitions" row.
- **Tests**: `goal.test.ts`; SQL `supabase/tests/competitions.sql`.

## Rounds / matchdays (migration `20261014010000_matchdays.sql`)

A **round** = one league-phase matchday (its two game days) or one knockout stage. The XI,
locks and coach pick stay per game day; rounds are an AGGREGATION unit (Standings Matchday
board now, user competitions next).

- `fixtures.matchday smallint` — ingested from FotMob `round` ("1".."8") / by-date
  `tournamentStage` ("3") via `parseMatchday` (`stage.ts`, vitest); null in knockouts. WC rows
  are null (not re-seeded) so the whole WC group stage is the single round `group`.
- `fixtures.round_key text` — GENERATED: `'md' || matchday` when stage is `league`/`group`
  and matchday is set, else `stage`. Keys: `md1`…`md8`, `group`, `playoff`, `r32`, `r16`,
  `qf`, `sf`, `third`, `final`. Index `(season_id, round_key)`.
- `season_rounds` view — per (season, round): `stage`, `matchday`, `starts_on`/`ends_on`
  (min/max game day), `fixtures`. The client orders by `starts_on`.
- `round_leaderboard` view — `daily_leaderboard` joined to the distinct (season, round, day)
  triples of `fixtures`: `points` (sum), `days_played`, `rank` per (season, round). A user
  appears once they have points on any of the round's days.
- Client `src/features/rounds/`: `types.ts` (`Round`), pure `roundLabel.ts` (`roundLabel(key)`
  → "Matchday 3" / "Play-off" / "Round of 16" …, `roundOfDay(rounds, day)`,
  `stepRound(rounds, key, dir)`, `defaultRoundFor(rounds, day)` = the round containing the
  day, else the latest started, else the first), `api.ts` (`loadRounds(seasonId)` ascending),
  `useRounds(seasonId)` (one-shot per season; null while loading / no season — never hands
  back another season's rounds), `RoundStrip` (label + "Oct 20 – 21" range + arrows).
- `src/components/StepperStrip.tsx` — the shared prev/next chrome (`label`, `subtitle`,
  `onOlder`/`onNewer` null = disabled) used by `DayStrip` (which gained `subtitle`) and
  `RoundStrip`.
- Where it shows: Standings **Matchday** segment (round board + `RoundStrip`; the selected
  round is DERIVED from a chosen key or `defaultRoundFor(rounds, seasonToday)`, so a season
  switch needs no reset effect), the Daily `DayStrip` subtitle, Live's `DayStrip` subtitle,
  Home's eyebrow (`<season.shortName> · <round.label>`, else "Game day").
- Tests: `roundLabel.test.ts`, `movement.test.ts`, `stage.test.ts` (parseMatchday), SQL
  `supabase/tests/round_leaderboard.sql`.

## Database (Supabase)

Schema lives in `supabase/migrations/` (`20260611190000_initial_schema.sql` + one file per change since).
Local stack via Supabase CLI + Docker: `supabase db start`, re-apply with `supabase db reset`,
stop with `supabase stop`.

**Tables**: `seasons` (competition dimension — see Seasons), `profiles` (1:1 with auth.users, auto-created by `handle_new_user` trigger;
holds `expo_push_token` + `web_push_subscription`), `teams` / `players` / `fixtures`
(FotMob-sourced reference data, bigint identity PKs; `teams` unique `fotmob_id`, `fixtures`
unique `fotmob_id` + `season_id`, `players` unique `(fotmob_id, season_id)`),
`formations` (8 seeded: 3-4-3 … 5-4-1, code is PK), `rosters` (one per user per
`game_day`, captain + `locked_at`), `roster_players` (slot 1–11), `player_match_stats`
(raw stats + **`fpl_points` computed at ingest** — views only aggregate it, PK
player+fixture), `tournament_picks` (one row per user: team/player/keeper + `locked`),
`nudges` (unique per from/to/game_day), `scout_cards` (jsonb content, unique per
player/game_day), `coaches` (FotMob coach id PK, one per team — Coach of the Day reference
data), `coach_picks` (one per user per `game_day`, `coach_id` + `locked_at`),
`coach_match_stats` (per coach+fixture yellow/red cards), `chat_messages` (global group
chat: body + `mentions uuid[]`) + `chat_read_state` (per-user `last_read_at` for the unread
badge). `position` is the `player_position` enum (GK/DEF/MID/FWD). `player_match_stats` also has `is_sub` (came on as
a sub) and `fixtures` has `motm_player_id` (Man of the Match) — both feed coach scoring.

**RLS model (friends-only)**: every table readable by any `authenticated` user.
Writes: own profile, own rosters/roster_players (**only while `locked_at is null`**),
own tournament_picks (only while `not locked`), insert-only nudges as yourself.
Reference/stats tables have no user write policies — ingest happens with the
service role key (server-side only, never in the app).

**Leaderboard views** (all `security_invoker`, all expose `rank`):
- `player_day_points` — helper: per player per game_day sum of fpl_points (includes live)
- `coach_day_points` — helper: per user/game_day, the Coach of the Day pick's points
  (sub goals/assists, sub MOTM, match result, coach cards; components exposed for the UI)
- `daily_leaderboard` — per user/game_day: sum roster players' points (captain ×2) **plus
  the coach pick's `coach_day_points`** (a user appears with a roster OR a coach pick)
- `overall_leaderboard` — daily summed across all game days (+ `days_played`)
- `team_pick_leaderboard` — finished fixtures: 3/win + 1/draw + goal difference (all matches)
- `player_pick_leaderboard` / `keeper_pick_leaderboard` — picked player's total fpl_points

Scoring decisions were confirmed by Anis on 2026-06-11 (no written spec exists yet) —
if rules change, the views are the only place scoring lives.

## FotMob ingest (`supabase/functions/ingest-fotmob`)

Edge function, service-role-only (rejects anon-key callers). **Season-driven**: reads the
`seasons` table at the start of every run (no league-id env var). Two modes:
- `{"mode":"seed","season":"ucl2026"}` — every fixture of that season's FotMob league +
  every participating squad (~1 min; `season` defaults to the active one)
- `{"mode":"daily","dates":["YYYYMMDD",...]}` — for EVERY non-archived season: fixtures on
  those dates (by-date leagues filtered on `primaryId`/`id` = the season's league id) +
  squads of the teams playing; defaults to today+tomorrow in US Eastern

Pure, vitest-tested helpers: `codes.ts` (`teamCode(kind, team)`: nations → `FIFA_CODES`
by name, clubs → `CLUB_CODES` keyed by **FotMob team id** (names differ between endpoints),
fallback = first 3 letters of the short name; `isPlaceholderTeam` = leading digit or
Winner/Loser ONLY — a bare `/` is NOT a placeholder, "Bodø/Glimt" is a club) and
`stage.ts` (`inferStage(match, kind)`).

Scheduled by pg_cron (`ingest-fotmob-daily`, 09:00 UTC = 5am EDT) via `net.http_post`,
reading `edge_base_url` + `service_role_key` from Vault (see DEPLOYMENT.md).

Hard-won FotMob facts — Champions League (verified 2026-10-14, don't re-derive):
- League id = **42** (`details.id`; by-date league objects: `primaryId` 42, their own `id`
  is a stage id like 943230). `leagues?id=42&tab=matches&type=league` → `fixtures.allMatches`
  (144 league-phase matches, 36 clubs; 2026/27 runs 2026-09-08 → 2027-01-27 then knockouts).
- `round` is a numeric STRING `"1"`…`"8"` in the league phase (→ `fixtures.matchday`); knockouts: `round` =
  `"playoff"`/`"1/8"`/`"1/4"`/`"1/2"`/`"final"`, `roundName` = `"playoff"`/`"Round of 16"`/
  `"Quarter-Finals"`/`"Semi-Finals"`/`"Final"` → `fixtures.stage` league/playoff/r16/qf/sf/final.
- By-date matches carry `tournamentStage` (`"3"` = matchday 3) instead of `round`.
- Club squads: same `squad.squad[].members[]` shape, but `cname`/`ccode` = the player's
  NATIONALITY. Some clubs return `squad.squad = null` (Shakhtar, Sabah) → zero players, not an error.
- Club team objects have no 3-letter code (`shortName` = "Man City") → `CLUB_CODES`.

Hard-won FotMob facts — World Cup (verified 2026-06-11, don't re-derive):
- JSON API moved to `https://www.fotmob.com/api/data/*` — the old `/api/*` returns HTML 404
- World Cup league id = **77** (`primaryId` on the per-group league objects)
- League endpoint: all matches under `fixtures.allMatches` (ids are strings there,
  numbers in matches-by-date — always `Number()` them)
- Squads: `squad.squad` groups; `positionId` 0/1/2/3 = GK/DEF/MID/FWD; `cname` = club
- Knockout fixtures use bracket placeholders ("2A", "1F/2C", "Winner SF 1") as teams —
  `isPlaceholderTeam()` filters them; those fixtures arrive via daily runs once decided
- No FIFA team codes anywhere → `FIFA_CODES` override map + name-slice fallback
  (verified collision-free across all 48 teams)
- Images: `images.fotmob.com/image_resources/playerimages/<id>.png`, team flags
  `.../logo/teamlogo/<id>.png`; **coach photos reuse the playerimages path** (coach id)
- Coach (Coach of the Day): the team endpoint `overview.lastLineupStats.coach`
  (`{id, name, countryCode}`) — `ingestSquad` reads it from the same fetch and upserts
  `coaches` (best-effort; never fails ingest). Stable per team, so coaches are pickable
  before any lineup posts.
- `game_day` = the game day of kickoff via `gameDayOf()` — a day runs until **6am ET**
  (`GAME_DAY_CUTOFF_HOUR`), NOT midnight, so a late kickoff up to ~2am ET belongs to the
  prior evening's slate (and a 02:00 UTC / 10pm EDT match is that same evening)
- Works with plain browser headers today; if 403s appear, FotMob re-enabled token
  gating (`x-mas` header) — see DEPLOYMENT.md

Edge functions are Deno — excluded from the app's tsconfig (`supabase/functions`).

**CORS (hard-won, cost a debugging round)**: functions the APP invokes from a browser
(`scout-card`, `send-push` nudge path) MUST handle CORS or supabase-js fails with the
opaque "Failed to send a request to the Edge Function" (a fetch-layer FunctionsFetchError,
NOT an HTTP error response — Chrome shows "Provisional headers are shown" on the blocked
request). `functions.invoke()` sends custom headers (authorization/apikey/content-type/
x-client-info) → browser fires a preflight `OPTIONS`. Each browser-invoked function must
(1) short-circuit `OPTIONS` → `new Response('ok', { headers: corsHeaders })` BEFORE any
auth check (preflight carries no credentials, so an auth gate would 401 it), and
(2) include `corsHeaders` (`_shared/cors.ts`, `Access-Control-Allow-Origin: *`) on every
real response. Cron/service-only functions (poll-live, ingest-fotmob) never need it.

**Service-role auth (`_shared/auth.ts`, `isServiceRole`)**: cron/ops-only functions
(poll-live, ingest-fotmob, send-push `auto`, scout-card service path) gate on the JWT's
**`role` claim being `service_role`**, NOT on the bearer being byte-identical to the
injected `SUPABASE_SERVICE_ROLE_KEY`. The exact-match approach silently 401s every cron
call when the dashboard/Vault service_role key diverges from the runtime-injected one —
which happens on projects using the new JWT signing keys (bit the hosted project: Vault
key verified correct, cron still 401'd). The role check is sound because these functions
keep **`verify_jwt = true`** (Supabase default; no per-function override in config.toml),
so the platform validates the signature before our code runs. **Never deploy these with
`--no-verify-jwt`** — that would let a forged unsigned `role:service_role` token pass.

## Auth & onboarding

**Email OTP codes, NOT magic links** (no deep-link handling needed; identical flow on
native and web). Flow: invite code + email → `signInWithOtp` → 6-digit code →
`verifyOtp(type:'email')` → onboarding (display name + avatar) → app.

- Route guards: root `_layout.tsx` uses `Stack.Protected` with three groups —
  `(auth)` when signed out, `(onboarding)` when signed in but `profiles.onboarded_at`
  is null, `(app)` otherwise. Screens never navigate across groups manually; they
  mutate state (verifyOtp / completeOnboarding + refreshProfile) and the guards switch.
- `useSession()` (src/features/auth/session-context.tsx): session + profile + loading +
  refreshProfile + signOut. Profile fetches piggyback on auth events, keyed by user id.
  Root navigator renders null while loading to avoid flashing the wrong group.
- **Invite code** = `INVITE_CODE` env (expo extra) checked client-side before the OTP
  request. It ships in the bundle: speed bump for a 10-friend league, not security.
- Avatars: 10 DiceBear presets (src/features/auth/preset-avatars.ts) or upload via
  expo-image-picker (base64) → Storage bucket `avatars` (public read; users write only
  inside `<uid>/`, policies in migration 20260612000000). Avatar URL is cache-busted
  with `?v=` because the storage path is stable.
- **Email templates must contain `{{ .Token }}`** or users get a magic link instead of
  a code. Local: supabase/templates/otp_email.html wired to BOTH `magic_link` and
  `confirmation` templates in config.toml (GoTrue picks confirmation for new users,
  magic_link for existing). Hosted: set both in the dashboard (see DEPLOYMENT.md).
- Push: `registerPushToken()` (src/lib/notifications.ts) runs on (app) layout mount —
  asks permission, stores Expo token in `profiles.expo_push_token`. No-ops on web,
  simulators, and Expo Go (SDK 53+ removed remote push from Go — needs a dev build).

## Home screen & live data

- `src/shared/gameday.ts` — game-day rules shared with the backend (synced Deno copy
  in `_shared/`, same drift-test mechanism as scoring; `npm run sync:shared` syncs both).
  ingest-fotmob imports it; the app's `useGameDay()` hook uses the identical function.
  **A game day runs until 6am ET** (`GAME_DAY_CUTOFF_HOUR`), not midnight: `gameDayOf(utc)`
  shifts back by the cutoff before taking the Eastern date, so late games (12am–2am ET)
  stay with the prior evening. `currentGameDay()` routes through it. The SQL recompute in
  migration `20260613000000_gameday_cutoff` mirrors this and MUST track the cutoff hour.
- `useGameDay()` (src/features/live) — today's fixtures with joined home/away teams
  (FK hint syntax: `teams!fixtures_home_team_fkey`), plus `firstKickoff` (next scheduled,
  doubles as XI lock time) and `liveCount`. Subscribes to **Supabase Realtime**
  postgres_changes UPDATEs filtered by game_day; `fixtures` was added to the
  `supabase_realtime` publication in migration 20260612010000.
- `useMyRoster(gameDay)` (src/features/roster) — XI status (`none`/`building`/`locked`),
  picked count, and live points (read from `daily_leaderboard`).
- `useActiveGameDay()` (src/features/live) — resolves the **build day**: the
  earliest game day ≥ today with a non-finished fixture (status scheduled/live),
  derived from `firstActiveDay()` (src/features/live/buildDay.ts, vitest-tested).
  It advances the instant the day's LAST match finishes (Realtime on fixture
  UPDATEs, debounced) and skips rest days; falls back to today. Returns the same
  shape as `useGameDay` for that day. Home keeps `useGameDay()` (today) for the
  date header + fixtures rail, but the kickoff countdown and `XIStatusCard`
  (`useMyRoster(buildDay)`, future-day label) follow the build day. **Lock/“started”
  is the build day's FIRST kickoff** (min `kickoff_utc` over ALL its fixtures), computed
  in `index.tsx` — `dayStarted = locked`. Once locked: countdown relabels to “Next match
  in” (it points at the next scheduled kickoff) and `XIStatusCard` shows Locked/Watch-live.
  (The earlier `firstKickoff === null` proxy was wrong — it only flipped after the LAST
  match started, so between games it still said “your XI locks in / Finish your XI”.)
- Home (app/(app)/index.tsx): header date + countdown to first kickoff, horizontal
  fixtures rail (`FixtureCard` — live minute is APPROXIMATED from kickoff time; the DB
  stores no match minute. It TICKS on its own 20s `setInterval` (`useApproxMinute`)
  while live — otherwise the card only re-renders on a realtime score event and the
  minute freezes at the last goal's timestamp, looking stuck minutes behind), and
  `XIStatusCard` whose CTA routes to /roster or /live
  (both placeholder screens for now). Live state flips the Screen glow to red.
- `FlagBadge` component: round (FotMob-style) and crest (FIFA-style) variants, renders
  `teams.flag_url`, optional live ring, code-text fallback.
- FotMob pre-fills 0–0 scores on scheduled fixtures — UI hides scores until live/FT.

### Match details sheet (tap a fixture)

Tapping any `FixtureCard` (Home rail, rest-day preview) opens `MatchSheet`
(`src/features/live/MatchSheet.tsx`) — a `BottomSheet` with a height-capped `ScrollView`:

- **Header** uses the `Fixture` we already have (home/away `FlagBadge` + codes + score or
  "vs") — NOT FotMob, to avoid a brittle name→FIFA-code mapping. A `lineupType` badge reads
  "Confirmed lineup" / "Predicted XI" (+ formation).
- **Home/Away toggle** → the selected team's XI on the shared `Pitch` via `LineupPitch.tsx`,
  which positions markers from FotMob `verticalLayout` (x, y in 0–1) with **y inverted**
  (`top% = (1 - y) * 100`) so the GK sits at the bottom goal (roster-pitch convention).
  Each marker = a **player headshot** (52px, `images.fotmob.com/.../playerimages/<id>.png`
  built from the FotMob id — same source ingest stores; lucide-`User` silhouette behind it
  as the 404 fallback) + a name pill (shirt number beside surname) + a **points pill** shown
  only when `points !== null` (so you can see what a non-picked player scored). **Gold ring
  (`c.captain`) when the player is in the caller's saved XI**. Default side = whichever has
  more of my players (tie → home), until the user taps. Empty/`null` lineup →
  "Lineup not announced yet".
- **News**: ≤3 headline cards (thumbnail + title + source) → `Linking.openURL`.
- **Open in FotMob** → `Linking.openURL('https://www.fotmob.com/match/<fotmob_id>')` (308
  universal link — opens the app if installed, else the site).

Data: `useMatchDetails(fotmobId, gameDay, enabled)` (`src/features/live/matchDetails.ts`,
types mirror the edge payload) invokes the **`match-details`** edge function. `FixtureCard`
gained a `gameDay` prop; `Fixture` + both `FIXTURE_SELECT`s (`useGameDay`,
`useNextGameDayPreview`) carry `fotmob_id`; `useNextGameDayPreview` returns
`{ fixtures, gameDay }` (gameDay null until resolved / when nothing is scheduled ahead).
See the `match-details` function section for the backend.

## Roster builder (src/features/roster — formation + pitch + player picker done)

- `PlayerPicker.tsx` — bottom sheet from an empty slot: players of the slot's position
  whose team plays on the current game day (teams come from `useGameDay()` fixtures, so
  the EST day rule is shared with the backend and midnight rollover Just Works — verified
  live when the clock crossed 12am EST mid-session). Search by name, single-select team
  chips (FlagBadge + code), Name/Club sort, photo with lucide-User silhouette fallback,
  already-picked players (XI + bench) disabled with a PICKED tag.
- `FlyingChip.tsx` — on pick, the sheet closes and a glowing player bubble springs from
  below the pitch into the slot (pixel coords from the Pitch `onLayout` + slot percents);
  the store `assign` happens on arrival.
- `useGameDay()` realtime channel names are instance-unique — Home stays mounted under
  the roster screen in the stack, and two subscriptions to one topic would clash.
- `api.ts` — `validateRoster` (11 players, formation shape, captain set & in XI, every
  player's team plays today), `saveRoster` (upsert rosters on user_id+game_day →
  delete+insert roster_players), `loadRoster` (hydrates the store on screen mount, so
  edits resume; unlimited edits before lock).
- **Lock**: client = first kickoff of the day (min kickoff_utc over ALL today's fixtures,
  not just scheduled ones). `RosterScreen` owns the lock decision (with its own re-render
  timer at kickoff): once locked it stops rendering the builder and instead shows the
  **live XI** — `LiveRosterView` for the build day if an XI was saved (identical to the
  team/league view, with live points + who's playing), or a friendly `LatecomerState`
  over the pitch when no XI was saved (no formation picker, no empty "+" slots). The
  builder's own internal locked/read-only branch is now a defensive fallback (only the
  un-locked builder path normally reaches `PitchView`). Server = `enforce_roster_lock()`
  trigger (migration 20260612020000) on rosters
  AND roster_players: rejects authenticated insert/update/delete once now() >= first
  kickoff (checks old+new game_day on updates); service_role and direct connections are
  exempt so system jobs/admin fixes still work. The builder now targets the **build day**
  (`useActiveGameDay`) rather than `currentGameDay()`: once the current day's last match
  ends you can build the next day's XI immediately (no waiting for EST midnight). The
  server lock trigger is unchanged — it locks each roster by its own game_day's first
  kickoff, so saving a future day is permitted. Builder store stays in-memory and not
  day-tagged: a build-day flip while the tab is mounted needs a tab re-entry to reload
  (known limitation).
- Captain: exactly one (validated), armband = Crown icon in the player card actions,
  pitch treatment = gold ring + C badge + gold glow (shadow/elevation).
- `PlayerCardSheet.tsx` — full player card (photo, position/team/club, today's opponent
  + local kickoff) opened by tapping a FILLED slot (with captain/remove actions) or
  long-pressing a picker row (info only). Contains the Scout Report section: invokes
  the `scout-card` edge function, renders form/strengths/risk/verdict with confidence
  as 1–5 filled gold stars, skeleton while loading, error card with Try-again,
  Regenerate button (cache overwrite).

## Superuser late-entry exceptions (migration `20260613010000_roster_exceptions.sql`)

> **SUPERSEDED / INERT (2026-06-13)** — Universal Late Entry (migration
> `20260613020000_universal_late_entry.sql`) gives the late-build right to EVERYONE, so
> the per-user exception no longer has any effect: the rewritten `enforce_roster_lock()`
> does not consult `roster_exceptions`. The table, `is_superuser()`, the `useMyException`
> hook, the session `is_superuser` flag and the League `ExceptionToggle` are intentionally
> kept (not reverted) but are now no-ops. See the "Universal late entry" section below.
> The rest of this section describes the original (now-inert) behavior.

Allows a designated superuser (admin) to grant specific users the right to build/edit
their XI after the normal kickoff lock, subject to the constraint that only players
whose team hasn't yet kicked off may be included.

**Database**
- `roster_exceptions` table: PK `(user_id, game_day)`, `granted_by uuid`, `created_at`.
  RLS: readable by any `authenticated` user; INSERT/DELETE restricted to superusers via
  `public.is_superuser()`. Added to the `supabase_realtime` publication so the client
  hook reflects grants/revocations instantly.
- `profiles.is_superuser boolean` (default false). Bootstrapped for
  `admin@example.com` by the migration's seed block; `handle_new_user` also sets
  it (to false) on new signups so the column is never null.
- `enforce_roster_lock()` trigger (same migration, supersedes the one in 20260612020000):
  exception-holders may INSERT/UPDATE roster_players after the lock, but each row's
  player must belong to a team whose kickoff is still in the future
  (`kickoff_utc > now()`); rows where the fixture lookup returns NULL are treated as
  not-yet-started (allowed). DELETEs are always permitted. Rosters upserts (no
  player-level check there) are also allowed for exception-holders. Non-exception
  authenticated users and any write before the lock are unchanged. service_role /
  direct connections remain fully exempt.
  **Note**: the `locked_at`-based RLS policy on `roster_players` is inert — `locked_at`
  is never written. The trigger is the sole server-side enforcement point; always test
  lock/exception behavior via the trigger, not RLS.

**Client**
- `profiles.is_superuser` is included in the session `Profile` type (session-context.tsx)
  so components can gate superuser-only UI without extra fetches.
- `useMyException(gameDay)` (src/features/roster/useMyException.ts): subscribes to
  Realtime on `roster_exceptions` filtered to `(auth.uid(), gameDay)`; returns
  `{ hasException, loading }`. Pass `null` to skip (loading state); the channel is
  torn down on unmount.
- `validateRoster` extracted to `src/features/roster/validateRoster.ts` (pure,
  dependency-free); re-exported from `src/lib/api.ts`. Added a `startedTeamCodes`
  parameter: if any picked player's team code appears in `startedTeamCodes` the
  validation rejects with a clear error — this is the client-side mirror of the
  trigger's per-row kickoff check.
- `RosterScreen` (app/(app)/(tabs)/roster.tsx): post-lock, exception-holders get the
  editable `PitchView` (not `LiveRosterView`/`LatecomerState`). `PitchView` receives
  `timeLocked` (UI cues) vs `readonly` (false for exception-holders), a filtered
  `eligibleTeams` list (kickoff in future, recomputed on a 30s `nowTick`), and a
  `startedTeamCodes` set passed through to `validateRoster`. An amber exception banner
  is shown in the builder when `inExceptionMode`. The picker is limited to
  `eligibleTeams` so expired teams disappear automatically — the server trigger is the
  backstop.
- League tab: `ExceptionToggle` (superuser-only, one per member card) calls
  `grantException(userId, gameDay)` / `revokeException(userId, gameDay)` from
  `src/features/league/exceptions.ts`. The league grant always targets `useGameDay().gameDay`
  (today's active game day) — correct while today is live; future-day granting is not
  yet supported. The toggle is hidden on the superuser's own card.

**Tests**
- ~~`supabase/tests/roster_exceptions_trigger.sql`~~ — removed; replaced by
  `supabase/tests/roster_universal_lock_trigger.sql` (see Universal late entry below),
  since the exception trigger is superseded.
- `src/features/roster/validateRoster.test.ts`: vitest unit tests covering the
  `startedTeamCodes` rule (started team present → reject, started team not in XI → pass,
  no startedTeamCodes → pass).

**Known limitations**: the league grant targets today's `gameDay`; granting for a
future day requires a direct DB write. A re-save of a hydrated roster containing a
now-started player is rejected by the trigger with no inline UI cue (consistent with the
rule, to be addressed). The 30s eligibility tick means a team kicking off mid-session
may linger in the picker briefly — the server trigger catches it.

## Universal late entry (migration `20260613020000_universal_late_entry.sql`)

The late-build right now applies to **everyone**, not just exception-holders. Rule:

- **Before the day's first kickoff**: unlimited edits/saves for everyone (unchanged).
- **After the first kickoff**:
  - A roster that was **on record before kickoff** is read-only (locks at kickoff) — as
    before. `RosterScreen` shows `LiveRosterView`.
  - A user who **missed the deadline** (no roster yet) may build **one** XI, restricted
    to teams whose kickoff is still in the future. It **locks the instant it is saved**.

**Server** — `enforce_roster_lock()` (this migration, supersedes the exception version):
distinguishes on-time vs late rosters by `rosters.created_at` (`< first_kickoff` =
on-time → frozen at kickoff; `≥` = late → one build allowed) and marks a late team
finalized with `rosters.locked_at`. Post-kickoff: reject if `locked_at` is set
(one-shot) OR the roster is on-time; otherwise allow `roster_players` writes only for
teams that haven't kicked off (NULL fixture = not started = allowed); DELETEs always
allowed (rebuild). Pre-kickoff: allow everything. The `locked_at`-based RLS policies now
also help (they require the parent's `locked_at IS NULL`), but the trigger is
authoritative — it alone freezes on-time rosters (whose `locked_at` stays null).

**Client**
- `saveRoster(gameDay, formation, slots, captain, finalize)` — `finalize` (a LATE save)
  stamps `rosters.locked_at` AFTER inserting the player rows (stamping earlier would trip
  the trigger/RLS on those very inserts).
- `RosterScreen`: `firstKickoffPassed = now ≥ first kickoff`; `locked = firstKickoffPassed
  && hasSaved` → `LiveRosterView`; `lateBuild = firstKickoffPassed && !hasSaved` →
  editable `PitchView`. A post-kickoff `hasSaved === null` shows a skeleton (no
  wrong-state flash). `LatecomerState` now renders only when `lateBuild && no team has a
  future kickoff` (everything started — nothing to pick).
- `PitchView` prop renamed `exception` → `lateBuild`; `readonly = timeLocked &&
  !lateBuild`; the banner explains the late-build constraints; on a successful save it
  calls `onSaved()` so `RosterScreen` flips to the locked view. `eligibleTeams` (future
  kickoffs, 30s `nowTick`) feed the picker; `startedTeamCodes` go to `validateRoster`.

**Tests**: `supabase/tests/roster_universal_lock_trigger.sql` — late+future-allow,
late+started-reject, late-delete-allow, finalize-then-reject (one-shot),
on-time-frozen-reject. (Replaces the exceptions trigger test.) `validateRoster.test.ts`
unchanged.

**Verification gap**: the SQL migration + test were authored but NOT applied/run against
the local stack in this session (Docker intentionally not started). Apply + run on the
next `supabase db reset` / deploy. Client typecheck + lint + vitest are green.

## Coach of the Day (migrations `20260619000000` + `20260619000100`)

A daily side-game folded into the roster builder. Each game day a user picks one **coach**
(a team's manager). Coach points are **added to the user's daily total** (they flow into
`daily_leaderboard` → `overall_leaderboard`) — there is no separate board.

**Scoring** (SQL-only, `coach_day_points` view): for the picked coach's team's fixtures that
day — sub goal **+3**, sub assist **+2**, sub Man-of-the-Match **+3** (only if the MOTM is
one of the coach's subs), win **+5** / draw **0** / loss **−3** (finished only), coach
yellow **−1**, coach red **−3**. Sub goals/assists + cards accrue live; result + MOTM
finalize at full time. Only **substitutes'** goals/assists count (starters don't) — the
"good substitutions = good coaching" hook.

**Lock / late entry** — identical to the roster's universal late entry, via
`enforce_coach_pick_lock()` (`coach_picks`): before the day's first kickoff, unlimited edits;
after it, an on-time pick (created before kickoff) freezes, while a user with no pick yet may
build ONE — restricted to coaches whose team hasn't kicked off — locking on save
(`saveCoachPick(..., finalize)` stamps `locked_at` AFTER the upsert). service_role exempt.

**Data** — `coaches` (FotMob coach id PK, one per team, ingested + refreshed by poll-live),
`coach_picks` (PK user+game_day), `coach_match_stats` (per coach+fixture cards),
`player_match_stats.is_sub`, `fixtures.motm_player_id`. All FotMob data verified present
2026-06-19 (incl. coach cards, e.g. Slot's red in Everton–Liverpool 2025-02-12).

**Client** (`src/features/roster/`) — `useCoachPick(gameDay, targetUserId?)` (pick + live
`coach_day_points` + breakdown, realtime on coach_match_stats/player_match_stats/fixtures),
`saveCoachPick`, `loadPickableCoaches`; pure `validateCoachPick.ts` (mirrors the trigger's
started-team check, vitest-tested); `CoachPicker` (bottom sheet), `CoachPointsBreakdownSheet`,
`CoachOfTheDay` (compact `Card` in `PitchView` — editable pre-lock / late-build, read-only +
breakdown once locked), `CoachBadge` (presentational chip in the `LiveRosterView` top bar —
coach photo + flag BESIDE it + surname (truncates) + "N pts"; tap → breakdown; shown on the
live screen AND `team/[userId]`), and `CoachLine` (flag + surname + pts on league member
cards). **`LiveRosterView` owns `useCoachPick` and adds the coach's points to the headline
top-left total** (`xiTotal + coachPoints`) so it matches the `daily_leaderboard` rank, then
passes the pick down to the presentational `CoachBadge`. **Known limitation:** a user with an on-time XI but no coach can't late-add a coach,
because the locked roster screen renders `LiveRosterView` (read-only) rather than the picker.

**Tests** — `validateCoachPick.test.ts`, `poll-live/parse.test.ts` (coach block vs
`__fixtures__/coach-cards.json`), and SQL `supabase/tests/coach_pick_lock_trigger.sql` +
`coach_day_points.sql`. Migrations authored but applied at next reset/deploy (Docker off).

## Live view (app/(app)/live.tsx + src/features/live)

- `useLiveRoster()` — saved XI (slot/captain/team ids) + initial player_match_stats for
  today's fixtures + **Realtime on player_match_stats** (added to the publication in
  migration 20260612030000, filter `fixture_id=in.(…)`). On each event it diffs the row
  to produce ticker copy (`describeDelta`: goal/assist/cards/CS/bonus/appearance, point
  values from shared POINTS) and bumps a per-player `changedAt` timestamp for flashes.
  Rank comes from daily_leaderboard, debounced 1.2s behind stat bursts.
- `LiveSlot` — photo bubble + name (with a tiny team flag from `LiveRosterPlayer.flagUrl`)
  + pill. Pill states: scheduled → kickoff time (faint),
  live → green points + red bubble ring, finished → dimmed (0.55) muted points. Points
  count up stepwise; a gold overlay flashes when `flashKey` changes. Captain shows
  DOUBLED points on the chip and keeps the gold ring/C badge (C moved to the top-LEFT
  so the MVP star owns the top-right). Once live/finished it also shows FotMob-style stat
  marks via `PlayerFieldIcons` — goal (ball) / assist (boot) / clean-sheet (shield) badges
  + green MVP star (see LINEUP STAT ICONS in the changelog).
- `PointsBreakdownSheet` — per-line points mirroring shared scoring (minutes/goals/
  assists/CS/saves/pens/cards/own goals/conceded/bonus), captain ×2 line (`base → total`).
- Layout reuses `slotLayout` with the formation derived from the saved slots' positions.
- Verified end-to-end by simulating a live match in psql: realtime pushed chips/ticker/
  total/rank updates with no reload; heredoc-into-`docker exec psql` SILENTLY does
  nothing — always `docker cp` a .sql file and `psql -f` it.
- **Day selector** (`DayStrip`, app/(app)/live.tsx): a centered label with
  prev/next chevron arrows (NOT the old horizontal pill strip — that was a
  `ScrollView` that stretched to fill the flex-column height and rendered the
  pills as full-height vertical bars). Days are loaded **ascending (oldest →
  newest)** so the LEFT arrow steps back in time and the RIGHT arrow steps
  forward; arrows disable at the ends of the range. The selected day is often
  NOT a fixture day (club seasons rest 5 days a week; an archived season opens on
  its placeholder `ends_on`), so each arrow steps to the NEAREST fixture day on
  that side (`stepDay` in `dayStep.ts`, vitest). Optional `from`/`to` props bound
  the query (Live passes the active season's `startsOn`; Standings the selected
  season's range). Label is relative —
  `Today` / `Yesterday` / `Tomorrow`, else `EEE d` (e.g. "Thu 11"). Source is
  still distinct `fixtures.game_day ≤ today`, default Today. Selecting a day
  remounts `LiveRosterView` (`key={day}`) — `useLiveRoster` and `LiveRosterView`
  take an optional `gameDay` (default today). Lets you view past days' XIs with
  final points/breakdowns. Capped at today (future = builder).
- `LiveRosterView` takes a `buildable` prop (default true). The live screen
  passes `buildable={day === today}` so the "no XI" empty state only shows the
  **Build your XI** CTA for the current day — on a PAST day with no saved XI it
  shows a static "No XI this day / You didn't pick a team for this game day."
  message (the CTA would otherwise mislead, routing to the current build day's
  roster).

## Navigation (tabs + stack)

`(app)` is a Stack containing a nested `(tabs)` group (custom `TabBar` component via
the Tabs `tabBar` prop): **Home / Roster / Table / Chat / League**. `live`,
`team/[userId]`, `picks` and `competitions/{index,new,[id]}` stay Stack screens ABOVE the
tabs so they push with back buttons. `TabBar`
takes a `tabs` subset prop and a `badges` prop (red unread dot — used for Chat); the
Profile tab comes later. The `(tabs)/_layout.tsx` renders a custom `AppTabBar` component
(not an inline render fn) so it can call `useChatUnreadWatcher()` for the badge. Stack `screenOptions` set
`headerBackButtonDisplayMode: 'minimal'` (bare chevron) — without it the back button
falls back to the title-less `(tabs)` group's raw route name. **Deep-link anchor**:
`unstable_settings = { initialRouteName: '(tabs)' }` so a cold launch via a deep link
(e.g. the Live Activity's `startingxi://live`) synthesizes `(tabs)` beneath the pushed
screen and a back chevron appears. The `live` screen also sets a `HomeFallbackBack`
`headerLeft` that `goBack()`s when there's history, else `router.replace('/(app)/(tabs)')`
— guarantees an exit even if the anchor doesn't apply.

## Live group chat (app/(app)/(tabs)/chat.tsx + src/features/chat)

One global room every authenticated user reads and writes (friends-only league).

- **Data** (`20260702000000_chat.sql` + `_prefs` + `_gifs` + `20260703000000_chat_replies_and_read_receipts.sql`):
  `chat_messages` (`user_id`, `body` 1–2000 chars OR null, `mentions uuid[]`,
  `gif_url`/`gif_width`/`gif_height` for an attached KLIPY GIF (reference only, no bytes),
  **`reply_to_id` bigint self-FK (`on delete set null`) for replies**, `created_at`; content
  check = text OR gif; RLS = authenticated read-all + insert-as-self; in `supabase_realtime`),
  `chat_read_state` (`user_id` PK + `last_read_at`; SELECT is now **authenticated read-all**
  — was own-row — so read indicators can show who's read how far; writes stay own-row; added
  to `supabase_realtime`) — drives BOTH the unread badge AND read indicators, and
  `profiles.chat_notifications text ('all'|'mentions'|'none', default 'all')` — the per-user
  notification preference (the `_prefs` migration replaced the original boolean).
- **`src/features/chat/`**: `api.ts` (members/messages/send/markRead + the notification pref
  read on its OWN query, decoupled from the session profile select — a missing column just
  defaults to on, never breaks login), `useChat.ts` (initial load + realtime INSERT deduped
  by id so the optimistic local echo doesn't double, **+ an `AppState` refetch on return to
  foreground** — iOS suspends the realtime socket while backgrounded and missed INSERTs aren't
  replayed, so we re-pull recent messages and merge on resume / notification-open),
  `mentions.ts` (PURE, tested —
  `findMentionQuery`/`applyMention`/`extractMentions`/`splitMentions`/`matchMembers`),
  `ChatComposer.tsx` (@-mention autocomplete: reads the in-progress @-token from the
  controlled cursor, floats matching members above the input, inserts `@Name `),
  `MessageRow.tsx` + `MentionText.tsx` (Messenger-style: author name small/grey ABOVE the
  bubble on the FIRST message of a consecutive run (group start), the author avatar beside the
  LAST message of the run (group end), own = solid purple bubble on
  the right; a centered divider marks a >1h silence; @-mentions highlighted, a mention of YOU
  is gold + gold bubble edge), `badge.ts` (zustand) + `useChatUnread.ts`
  (`useChatUnreadWatcher` in the tab bar).
- **Read indicators** (Messenger group-style): `useReadReceipts.ts` loads every member's
  `chat_read_state.last_read_at` into a `Map<userId, ISO>` kept live via realtime; the pure
  `computeReaders(messages, members, readAt, meId)` (`readers.ts`, vitest-tested) buckets each
  member (except you) under their read high-water message (newest `created_at ≤ last_read_at`);
  `chat.tsx` folds it into `readersByMessage` and `MessageRow` renders `ReaderAvatars.tsx`
  (stacked ~14px avatars, cap 4 + "+N") beneath that message — **always right-aligned**
  (Messenger-style), for own AND others' messages. `chat.tsx` stamps `markChatRead` on new
  messages while focused so your read position advances live for others.
- **Replies** (slide-to-reply): `MessageRow` wraps each row in an RNGH `Gesture.Pan` — a
  rightward drag past 55px fires `onReply` (with a `CornerUpLeft` hint; `failOffsetY` yields to
  the list scroll; the pan's `onStart` sets a suppress-tap flag so a slide does NOT also toggle
  the time or trigger the quote jump on release). `chat.tsx` holds `replyingTo`; `ChatComposer` shows a reply bar (author +
  snippet + ✕, `onCancelReply`); on send, `chat.tsx` threads `replyingTo.id` into
  `send`/`sendGif` and clears it. A reply carries `ChatMessage.replyTo` (from the
  `MESSAGE_SELECT` self-embed) and `MessageRow` renders a tappable `ReplyQuote.tsx` above its
  bubble (author + snippet, or "GIF" + a thumbnail). Tapping the quote jumps to the original
  (`FlatList` ref + `scrollToIndex` + `onScrollToIndexFailed` fallback) and plays a shared-value
  highlight pulse. Replying to a reply is fine — the quote is only one level deep, so it just
  references that reply as a normal message. The quote preview is resolved client-side
  (`resolveReplyPreview` in `replyPreview.ts`, from the loaded messages + members) rather than
  embedded in the query — a PostgREST self-embed 400'd (see the changelog). `loadRecentMessages`/
  `loadMessage` now `console.warn` on error instead of silently returning empty. Replies push:
  the quoted message's author gets a "<name> replied to you" notification (see the send-push
  chat mode).
- **Time reveal**: tapping a bubble reveals its send time. State is a single `revealedTimeId`
  in `chat.tsx` (not per-row), so **at most one time shows at a time** (tap again clears, tap
  another switches); the caption animates via a reanimated shared value (height + opacity,
  ~160ms) — NOT FlatList `entering/exiting` (WEB GOTCHA #3).
- **Unread badge**: the watcher computes initial unread from `chat_read_state.last_read_at`
  and flips the store true on any incoming message from someone else; `chat.tsx` clears it
  on focus (`markChatRead` + store reset), so the red dot means "unseen since you last
  opened chat". `TabBar` renders the dot via its `badges` prop.
- **Notifications**: on send the client inserts the message then invokes `send-push`
  `{kind:'chat', message_id}` (best-effort). The chat screen's top-right bell opens a menu
  (All messages / Only mentions / None) writing `chat_notifications`. See the send-push
  chat mode for how mentions get a distinct "<name> mentioned you" push.
- **GIFs** (Discord-style, KLIPY): `klipy.ts` searches KLIPY directly from the client
  (`/api/v1/<KEY>/gifs/{trending,search}`, key = `EXPO_PUBLIC_KLIPY_KEY` as a path segment,
  in the bundle; GIF button hidden when unset via `klipyConfigured()`). `GifPicker.tsx`
  (BottomSheet: debounced search + 2-col masonry grid of `sm` previews, "Powered by KLIPY")
  → `useChat.sendGif` → `sendChatGif` inserts a gif-only message (url + dims, no bytes).
  `MessageRow` renders it with `expo-image` (animated, ≤200px). We store ONLY the reference.
  The composer's "GIF" button collapses (reanimated) as soon as the input has text —
  Messenger-style — and returns when it's cleared.
- `chat.tsx` = header (title + bell) over an inverted `FlatList` + `ChatComposer`, inside a
  `KeyboardAvoidingView`. Dev preview with mock data: `/dev/chat` (`__DEV__` only).

## Friends tab (app/(app)/(tabs)/league.tsx + src/features/league)

`useLeagueMembers()`: all profiles + today's roster (status none/building/locked +
picked count) + daily_leaderboard points + tournament_picks (FK hints needed:
`players!tournament_picks_player_id_fkey` / `..._keeper_id_fkey` — two FKs to players).
2-col grid cards: avatar, status chip (CircleDashed/ClipboardList n∕11/Lock), points
once locked, and the member's tournament picks row (team FlagBadge + player + keeper).
Realtime: player_match_stats changes → debounced refetch; pull-to-refresh.

**Hidden until kickoff**: `team/[userId]` shows an EyeOff "Team hidden until kickoff"
state before the day's first kickoff for anyone but yourself — a UI gate only (RLS is
league-readable by design); fine for a friends league, revisit if that changes. **A PAST
day is exempt**: when reached with a `gameDay` param strictly before `currentGameDay()`
(from the Daily standings day-selector), the gate is bypassed (`isPastDay`) and that day's
roster is always revealed — past days are fully played.

## Trophy tab (app/(app)/(tabs)/leaderboard.tsx + src/features/leaderboard)

Six segments backed by the SQL views: Daily, Matchday, Overall, Team pick, Player pick,
Keeper pick (`useLeaderboard(key, season, { gameDay?, roundKey?, prevRoundKey? })` —
`season` null = loading for every board but Daily).
- **Matchday board** (`'round'`): `round_leaderboard` for the selected round (a `RoundStrip`
  under the pills; default = the round containing the season's "today"); movement = vs the
  previous round's final ranks; empty copy "No points in this round yet." Row tap → today's
  team view (a round spans two days).
- **Movement baselines** (club calendar): Daily = vs the previous FIXTURE day (not the
  calendar day before — usually a rest day); Overall = totals excluding the latest PLAYED day
  (so a rest day still shows what the last matchday changed). Pure helpers in
  `leaderboard/movement.ts`.
- **Season switcher** (the World Cup ARCHIVE lives here): a `SeasonPicker` chip in the
  header, defaulting to the active season. Picking an archived season shows its boards
  read-only: Overall filters `overall_leaderboard` by `season_id` (movement computed from
  daily rows inside the season's range), the pick boards filter by `season_id` and their
  segments are hidden when `!season.hasTournamentPicks` (segment resets to Daily), the
  Daily `DayStrip` is bounded to `[startsOn, min(today, endsOn)]` and opens on
  `defaultDayFor(season, today)` (today while running, the last day once archived).
  Past-day rows still open `team/[userId]?gameDay=` (always revealed for past days).
- **Daily past-day selector**: the Daily segment shows a `DayStrip` (the same component the
  Live view uses) below the segment pills. `leaderboard.tsx` holds a `day` state (default
  today, reset to today whenever the Daily board is re-opened); it passes `day` to
  `useLeaderboard` only for Daily (other boards pass `undefined` = today). `fetchBoard`
  filters `daily_leaderboard` by the selected day; movement = vs the calendar day before the
  selected day (`subDays`). Lets you see who won any past day. No selector on the other boards.
- Movement arrows: Daily = vs the previous FIXTURE day in the season; Matchday = vs the
  previous round; Overall = vs cumulative totals excluding the latest PLAYED day (days with a
  live/finished fixture — `daily_leaderboard` has 0-point rows for saved-but-unplayed days;
  computed client-side, competition ranking "1224"). Pick boards have no movement.
- Pick boards join `profiles` client-side for avatars (views don't carry them) and show
  the pick (flag/photo) + name as the row's sub-line.
- Top 3 = podium styling (gold/silver/bronze rank circle + tinted border, points colored).
- Realtime: any player_match_stats change → debounced refetch while on Daily/Overall.
  Pull-to-refresh on every board. Row tap → `/team/[userId]`.
- `team/[userId]` reuses `LiveRosterView` (extracted from live.tsx; `useLiveRoster`
  takes an optional target user id) — anyone's XI with live points/breakdowns, RLS
  allows league-wide reads. Accepts an optional `?gameDay=` param (passed by the Daily
  board's rows for a past day) → shows that day's roster (`buildable={false}`, day appended
  to the title) and bypasses the hidden-until-kickoff gate for past days. `layoutFromPositions` (formations.ts) positions ARBITRARY
  position lists so partial/odd rosters can't crash the pitch (found via a 4-player
  seed roster: "Unknown formation 1-0-2").
- Seed data note: local league has a second user "Rival Rik" (rival@example.test) with
  June 11+12 rosters and tournament picks for board testing.

## Tournament picks (app/(app)/picks.tsx + src/features/picks)

Per SEASON, and only for seasons flagged `has_tournament_picks` (the World Cup; the
Champions League has none — Home hides the row and never redirects, the League cards hide
the picks row, `useTournamentPicks(seasonId)` with `null` = no picks/not loading).
Three sequential pickers — Team (the teams in that season's fixtures as a flag grid),
Player (search that season's players), Keeper (GKs only) — then `savePicks(seasonId, …)`
upserts tournament_picks on `(user_id, season_id)`. Surfaced as a **blocking onboarding
step**: Home redirects to /picks (back disabled) when a user has no picks AND the
deadline hasn't passed (`!hasPicks && !locked`); afterwards reachable via the Home
"Tournament picks" row. Once locked the screen is a summary card (pick + current points
from the three leaderboard views).

**Lock** — FIXED deadline, NOT the opening match (the league started late):
`TOURNAMENT_PICKS_DEADLINE = 2026-06-18T16:00:00Z` (Jun 18 2026 12:00 ET, end of GW1).
`useTournamentPicks` derives `locked = now >= deadline` (hard cutoff for everyone).
**Latecomers who join after the deadline get NO picks** — picking a team after seeing
GW1 results would be unfair. They're not trapped, though: once `locked`, the blocking
condition `!hasPicks && !locked` is false, so they're never force-redirected and the
/picks screen shows a read-only "Picks closed" card (the only state where `!loading &&
!showPickers && !hasPicks`). Server: `enforce_tournament_picks_lock()` trigger (migration
20260612070000 supersedes …040000) rejects ALL authenticated writes after the deadline
(including first inserts); service_role/direct exempt. **The trigger's `v_deadline` MUST
stay in sync with `TOURNAMENT_PICKS_DEADLINE`** (two languages, no auto-sync — both carry
a cross-ref comment). The legacy `locked` boolean still gates RLS updates but the trigger
enforces.

**Team-pick scoring** = `team_pick_points(team_id)` SQL function (same migration):
group win +3, group draw +1, KO win +5 per match, stage bonuses reach-R16 +5,
reach-QF +8, reach-SF +12, win-final +20. `team_pick_leaderboard` is rebuilt on it.
Requires `fixtures.stage` (group/r32/r16/qf/sf/third/final) — ingest-fotmob infers it
from FotMob round/group fields with a WC2026 calendar-date fallback; pre-existing rows
defaulted to 'group' (correct — only group fixtures were stored). KO matches decided
on penalties read as draws (no pens stored) and earn no win points — known limitation.

## PWA (web)

- **Phone-column on desktop web**: `PhoneFrame` in the root layout (web only) pins the
  whole app to a centered `layout.webMaxWidth` (480px) column with bg-colored gutters.
  Native is untouched — Platform check, not a media query. `BottomSheet` (whose `Modal`
  portals OUTSIDE `PhoneFrame`) carries its own matching web-only `maxWidth` +
  `marginHorizontal:'auto'` so sheets line up with the column instead of spanning the window.

- `public/` → copied to dist: `manifest.json` (standalone, theme #0A0E16, 192/512 +
  maskable icons in public/icons), `sw.js` (offline shell: network-first navigations
  with cached fallback, cache-first `/_expo/static/*`; push + notificationclick handlers).
- **App icon = the Final Whistle whistle-spiral mark** (gold/teal/purple/pink on #12051E
  navy), reused across web + native. The whole set (native `icon.png`, `favicon.png`,
  PWA 192/512, splash, Android adaptive fg/bg/monochrome) is regenerated from
  `Sportzio/final-whistle/apps/mobile/assets/icon.png` (full-bleed master) +
  `.../assets/final_whistle_logo_color_transparent1.png` (transparent, for splash +
  adaptive foreground) via PIL/sips. iOS uses the top-level `icon` (the old
  `ios.icon: ./assets/expo.icon` Icon-Composer placeholder was removed).
- `app/+html.tsx` = custom HTML shell: `<title>Starting XI</title>` (static base),
  manifest link, theme-color, apple-touch-icon, iOS standalone metas.
- **Browser tab titles**: Expo Router ships `documentTitle: { enabled: false }`, so
  per-screen `title` options drive ONLY the native/web header bar — they never touch
  `document.title`. `useWebDocumentTitle()` (src/lib/web-title.ts, called in the root
  layout) sets the tab title per route on web ("Live · Starting XI", etc.); no-op on native.
- SW registered web-only in the root layout (`registerServiceWorker()` in lib/webpush.ts).
- **Web Push**: VAPID public key ships via `EXPO_PUBLIC_VAPID_KEY` (.env) —
  **expo-constants `extra` proved unreliable for NEW vars on web dev (stale
  serialization even after cache clears); EXPO_PUBLIC_* inlining is the mechanism to
  use for client-visible config going forward.** Private key = function secret
  (supabase/functions/.env locally). `WebPushToggle` (Home, web-only): permission
  prompt behind the switch → pushManager.subscribe → profiles.web_push_subscription;
  disable unsubscribes + nulls. Denied state shows browser-settings guidance.
- `InstallPrompt` (Home, web-only): beforeinstallprompt capture/re-fire on
  Chromium/Android; iOS Safari gets an Add-to-Home-Screen instructions sheet
  (push on iOS needs 16.4+ AND the installed PWA). Hidden when standalone.
- Device verification (needs a human + HTTPS): install PWA → toggle notifications on
  → have a friend nudge → notification on locked phone. Edge-runtime delivery was
  verified to the FCM boundary with a synthetic subscription.

## Polish / motion system

- Entrances: FadeInDown with small delays per section (Home, Live top bar);
  staggered list reveals on NATIVE only.
- `PulsingDot` (live indicator), `CountdownTimer` shifts red under 30 minutes,
  Screen takes a `parallax` shared value (Home scroll drives the glow at ¼ speed),
  tab transitions `animation:'shift'` (native only), pressed states on all Pressables.
- `CaptainBurst` (features/live): 14-particle WC-palette confetti over the captain's
  slot when their points rise; replayed by remounting with a bumped key. Deterministic
  spread (no Math.random).
- Haptics (`lib/haptics.ts`): expo-haptics on native (success notification per score,
  heavy impact for captain), `navigator.vibrate` fallback on web. Triggered in
  LiveRosterView off total/captain point increases.
- 60fps: all animation on the UI thread via reanimated; LiveSlot + leaderboard Row
  memoized; per-chip count-up is throttled JS state (1 tick/110ms).

**WEB GOTCHAS (hard-won, do not regress):**
1. **The service worker must NEVER intercept dev bundles** (`.bundle` / `?dev`) —
   runtime-cached chunks survive server restarts and Metro cache clears, serving
   stale code that no restart fixes. sw.js skips them; bump the cache version when
   changing sw.js.
2. **refreshControl on web swallows ALL scroll content**: react-native-web re-parents
   children into the cloned RefreshControl element, whose web stub renders null —
   and wrapper components break the cloning contract even on native. Use
   `useThemedRefreshControl()` (raw element, returns undefined on web).
3. Reanimated `itemLayoutAnimation`/entering inside FlatList cells are unreliable on
   web — the single-column leaderboard animates on native, renders plain on web.
   **NEVER put per-cell `entering` on a `numColumns` (multi-column) FlatList**: the
   layout-entering animation detaches the cell from normal flow during the entrance,
   collapsing the row height so the next row overlaps it (intermittently — a realtime
   refetch replaying the animation mid-flight is enough to leave a cell stuck). This
   broke the League tab's 2-col grid on iOS "from time to time". Fix used there: render
   the grid as a plain `ScrollView` + flex-wrap `View` of 50%-width cells instead of a
   `numColumns` FlatList — a `FadeInDown` `entering` on a normal-flow flex child only
   transforms its paint position, never its layout box, so the entrance is kept on
   native with no overlap. Give each cell a stable `key` so the entrance plays once on
   mount and doesn't replay on data refetch. (A small friends list doesn't need FlatList
   virtualization; for a long multi-column list you'd want a different approach.)
   PickSteps' `numColumns={4}` grid is safe because it never animated cells.
4. Metro caches live in `$TMPDIR/metro-cache` AND `$TMPDIR/metro-file-map-*` — clear
   BOTH (plus node_modules/.cache) when chasing stale-bundle ghosts.

## Shipping (see RUNBOOK.md for recipes, DEPLOYMENT.md for platform setup)

- `eas.json`: development / preview (internal distribution) / production profiles;
  app.config has `ios.bundleIdentifier com.novem.startingxi` + `aps-environment`
  entitlement (push) + non-exempt-encryption false.
- EAS project link: `extra.eas.projectId` in app.config.ts (EAS CLI can't write to a
  dynamic config — it was added by hand; the CLI's suggested snippet is app.json-shaped,
  the `expo` wrapper key must be dropped).
- Web: `Dockerfile` (multi-stage: expo export → Caddy) + `Caddyfile` — sw.js is
  no-cache + Service-Worker-Allowed:/, hashed `_expo/static` immutable, HTML
  fallback for client routes. Build args = the client env vars (`SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `INVITE_CODE`, `EXPO_PUBLIC_VAPID_KEY`, `EXPO_PUBLIC_SENTRY_DSN`,
  `EXPO_PUBLIC_KLIPY_KEY`). **Every `EXPO_PUBLIC_*` the client reads must be declared as a
  Dockerfile `ARG`+`ENV`** — a Railway service variable alone isn't seen by `expo export`
  (it inlines at build time), so a new var silently ends up empty in the web bundle.
- `scripts/seed.sh local|<url> <srk>`: migrations + full FotMob seed.
- `.env.example` is the canonical map of client vars vs function secrets vs Vault.
- `RUNBOOK.md`: re-seed, manual poll, void fixture, reset roster, pre-tournament
  checklist, two-account smoke loop.

## Messy realities / resilience

- **Postponed/abandoned/cancelled fixtures**: poll-live maps FotMob's abandoned reason
  to 'postponed' and DELETES that fixture's player_match_stats (scores void; CS and
  leaderboards self-correct because everything aggregates stats). team_pick_points only
  counts status='finished'. FixtureCard shows the status; LiveSlot pill shows PPD.
- **Did not play**: no stats row + match finished → LiveSlot shows a faint DNP pill;
  breakdown sheet explains "Did not play — 0 points". (Verified against the REAL
  Canada–Bosnia 1–1: four seeded-XI players genuinely didn't feature.)
- **FotMob failures**: poll-live fetch retries ×3 with exponential backoff; every
  active-window run writes a heartbeat to `sync_state['poll_live']`
  ({ok, active, failures}). `useStaleLiveData` shows the amber "Live data delayed —
  last update HH:MM" banner when matches are live and the heartbeat is >5 min old or
  failing.
- **Duplicate stats**: PK (player_id, fixture_id) + upsert onConflict — re-polling the
  same finished match keeps the row count identical (verified: 32 → 32).
- **Game-day boundaries**: src/shared/gameday.test.ts covers the 6am-ET cutoff in EDT and
  EST — late games (midnight/2am ET) staying with the prior evening, the 6am flip, raw
  `estDateOf` vs `gameDayOf`, and `currentGameDay` offset walking.
- **Rest days**: Home shows the EmptyState plus a preview rail of the NEXT game day
  with fixtures (`useNextGameDayPreview`, one-shot; labelled "Tomorrow" or `EEE, MMM d` —
  a club season plays twice a week, so the next slate may be days away).
- **Usage guard**: every edge function calls `bump_usage(fn)` → `usage_log(fn, day,
  count)` (readable in-app/SQL). Budget vs Supabase free tier (500K edge
  invocations/mo): poll-live 720/day ≈ 21.6K/mo + push windows 96/day ≈ 2.9K/mo +
  ingest ~30/mo + user-driven scout/nudges ≈ a few K/mo → **≈ 28K/mo ≈ 6% of free
  tier**. Inspect: `select * from usage_log order by day desc, fn;`
- **Sentry** (`src/lib/sentry.ts`): env-gated by EXPO_PUBLIC_SENTRY_DSN (off without
  it). Root layout calls initSentry() pre-render and exports withSentry(RootLayout);
  config plugin '@sentry/react-native/expo' handles native crash hooking. Works on
  web too (browser SDK under the hood). Source-map upload needs SENTRY_AUTH_TOKEN at
  EAS build time — optional, see DEPLOYMENT.md.

## Nudges & push (`supabase/functions/send-push`)

- Friends tab: members with `pickedCount < 11` (and pre-lock, not yourself) get a Bell
  "Nudge" button. Flow: app INSERTs into `nudges` — the unique index
  (from_user, to_user, game_day) IS the rate limit (1/day per recipient; 23505 → shown
  as already-nudged) — then invokes send-push `{kind:'nudge', to_user}` best-effort.
- send-push nudge mode: verifies the caller's JWT AND that today's nudge row exists
  (so the rate limit can't be bypassed by calling the function directly), then pushes
  "<name> nudged you — first kickoff in 2h 14m".
- Delivery: Expo Push API (no secrets needed) for `profiles.expo_push_token`; Web Push
  via `npm:web-push` when VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY secrets are set AND
  `profiles.web_push_subscription` is populated (nothing registers web subscriptions
  yet — dormant by design). Remember: Expo Go (SDK 53+) gets no remote push — tokens
  only exist on dev/EAS builds.
- Automated pushes: pg_cron `push-windows-15min` posts `{kind:'auto'}`; the function
  checks two 15-minute windows against today's first kickoff KT (window width MUST
  equal the cron interval): [KT−3h, +15m) → "Lineups are in, build your XI" to anyone
  without a roster today; [KT, +15m) → "Teams are locked — see what your friends
  picked" to everyone. Outside both → instant idle. Cron retries could double-send
  within a window (accepted for a friends league).
- Competition pushes: `{kind:'competition', competition_id}` — see "User competitions".
- Chat pushes: `{kind:'chat', message_id}` (browser/user-invoked after inserting a message).
  JWT-gated; verifies the message belongs to the caller and is <60s old (anti-spoof/replay),
  then respects each recipient's `chat_notifications` (except the sender). Each recipient gets
  exactly ONE push, most-direct first: the **replied-to** user (author of the message's
  `reply_to_id`, on pref 'all' OR 'mentions') gets title=`<name> replied to you`; else a
  **mentioned** user (pref 'all' OR 'mentions') gets title=`<name> mentioned you`; else everyone
  on 'all' gets title=`<name>`; 'none' gets nothing. All carry the message preview. Best-effort.
  **Redeploy send-push.**

## Scout cards (`supabase/functions/scout-card`)

Caller: any signed-in user (JWT checked via auth.getUser; service role also allowed).
Cache-first on scout_cards (player_id, game_day) — `regenerate: true` overwrites.
On miss: prompt = player identity + the player's SEASON (name + kind — `club` reads as
"plays club football for X" in a nation season and as a nationality tag in a club season;
no hard-coded competition copy) + last 5 player_match_stats (joined fixtures) +
today's opponent → OpenAI **gpt-4o-mini**, JSON mode, ≤250 output tokens →
`{form_summary, strengths[2], risk, pick_verdict, confidence 1–5}` (validated/clamped)
→ upsert + return. Secrets: `OPENAI_API_KEY` (+ optional `SCOUT_MODEL`); without it the
function returns a clear error and the UI shows it (cached cards still work).
Local note: one hand-seeded card exists for Alphonso Davies/2026-06-12 (UI testing
without a key) — regenerate replaces it once a key is configured.

## Match details (`supabase/functions/match-details`)

Browser-invoked (mirrors `scout-card`): `OPTIONS` short-circuit → `corsHeaders`, then a
JWT check (any signed-in user; service role also allowed). `verify_jwt = true` (no override).
POST `{ fotmobId, gameDay }` → `{ ok, ...MatchDetails }`.

- Proxies FotMob `…/api/data/matchDetails?matchId=<fotmobId>` (same `BROWSER_HEADERS` +
  retry/backoff as poll-live) — the FotMob API is **CORS-blocked from the web build**, so a
  proxy is required (not optional). Calls `bump_usage('match-details')`. No caching
  (user-driven taps; predicted lineups change pre-kickoff).
- Reads the **caller's** picked FotMob ids for `gameDay`
  (`rosters → roster_players → players(fotmob_id)`, filtered by `user_id`, via the admin
  client) → `Set<number>` used to flag `isMine` on starters.
- Also builds a **points map** for ALL lineup starters: lineup FotMob ids → `players.id`
  → `player_day_points(points)` for `gameDay` → `Map<fotmobId, number>`, passed to the
  parser so each starter carries `points` (null when the match has no stats yet). Lets the
  sheet show what non-picked players scored.
- Parsing is a PURE module `parseMatchDetails.ts` (no Deno/network) → vitest-tested in
  `parseMatchDetails.test.ts` against real captures in `__fixtures__/`
  (`mex-rsa-confirmed.json`, `fra-sen-predicted.json`). Payload shape (`MatchDetails`):
  `lineupType` (`'confirmed'` ← FotMob `standard`, `'predicted'` ← `lastStarting11`, else
  `null`), `home`/`away` (`{ formation, players[] }`, starters only, each with
  `verticalLayout` x/y passed through + `isMine` + `points` (null = no stats yet) +
  `goals`/`assists` (from `performance.events`) + `cleanSheet` (finished, team conceded 0,
  GK/DEF/MID via `usualPlayingPositionId`) + `isMotm` (`matchFacts.playerOfTheMatch.id`) —
  rendered as stat marks by `LineupPitch`/`PlayerFieldIcons`),
  `news` (≤3, English only — drops `_es`
  ids; `postReview` when finished else `preReview`), and `fotmobUrl`.
- No unit test on `index.ts` (Deno orchestration; no local Deno) — **deploy-verified**, like
  poll-live. Parser carries the testable logic. The client's `useMatchDetails` mirrors the
  payload types in `src/features/live/matchDetails.ts`.

- `formations.ts` — the 8 formations (mirrors the DB seed), `slotPositionList(code)`
  (slot 1 = GK, then DEF/MID/FWD — matches `roster_players.slot_position`), and
  `slotLayout(code)` (percent x/y per slot; lines at FWD 21 / MID 43 / DEF 65 / GK 85).
- `store.ts` — zustand `useRosterBuilder`: `slots[11]`, `bench`, `captainId`.
  **`setFormation` re-seats everyone (XI + bench) into the new shape**; players whose
  line is full go to `bench` (the reassignment tray). Switching back auto-reseats.
  `assign` rejects wrong-position slots. In-memory only — server save comes with the
  player picker step.
- `Pitch.tsx` — layered SVG art, viewBox 0 0 100 140, children overlay. Two variants:
  `clean` (default, FotMob-style seamless grass) and `striped` (3 wide mow bands).
  Lines are a single low-opacity pass flush with the edges (no padding, no glow,
  no spots/corner arcs — reviewed by Anis 2026-06-12, keep it minimal).
  **Aspect-locked**: caller `style` sizes an invisible frame; the pitch itself is
  measured-and-fitted to the viewBox ratio (100:140), centered, with its own
  radius/clip — never stretched. `onLayout`/rest props land on the FITTED pitch,
  so pixel-coordinate consumers (FlyingChip, CaptainBurst) keep measuring the
  real thing. Callers don't pass borderRadius anymore. **Only the grass SVG is
  clipped** (an inner `overflow:hidden` rounded layer); the slot overlay children
  are NOT clipped, so a bottom-line GK's name/points pill can spill past the pitch
  edge without being cut off.
- `PlayerSlot.tsx` (pulsing dashed "+" when empty, photo bubble + C badge when filled),
  `FormationCard.tsx` (mini dot diagram, gold GK dot), `BenchTray.tsx`.
- Screen flow (app/(app)/(tabs)/roster.tsx): no formation → picker grid; then pitch view
  with a formation switcher bottom sheet (opened by **tapping the formation header** —
  the "Formation / 4-3-3" label carries a ChevronDown affordance pre-lock; disabled and
  chevron hidden once locked, so locked rosters stay read-only), slot action sheet
  (captain/remove; player picker is the NEXT step), bench tray, and a dev-only auto-fill
  button for testing the reseat logic.
- Dev preview: `/dev/pitch` renders the bare pitch + empty slots (for device eyeballing).

## Scoring (`src/shared/scoring.ts`)

Pure, dependency-free FPL rules: appearance 1/2 (60min gate), goals 6/6/5/4 by position,
assist 3, clean sheet 4/4/1/0 (requires 60+ min), 1 per 3 GK saves, pen save +5,
pen miss −2, yellow −1, red −3, own goal −2, −1 per 2 conceded (GK/DEF only).
Bonus 3/2/1 from top-3 FotMob ratings per fixture, ties share by competition rank
(9.1/9.1/8.5 → 3/3/1) — deterministic, order-independent.

- **Captain ×2 lives at roster level** (SQL leaderboard views), never in per-player points.
- Runs in two runtimes: the app imports `@/shared/scoring`; poll-live (Deno) imports the
  byte-identical copy at `supabase/functions/_shared/scoring.ts`. **Edit src/shared only**,
  then `npm run sync:scoring` — a unit test fails if the copies drift.
- Tests: `src/shared/scoring.test.ts` (vitest, `npm test`).

## Live polling (`supabase/functions/poll-live`)

pg_cron `poll-live-2min` (`*/2 * * * *`) → edge function. Exits instantly (one indexed
query, no FotMob traffic) unless a fixture is within kickoff−5min … kickoff+3.5h
(≈ fulltime+30min incl. extra time). For active fixtures: fetches FotMob matchDetails,
parses per-player stats, computes fpl_points (base + bonus) with the shared scoring
module, upserts player_match_stats on (player_id, fixture_id), updates fixture
status/score.

Stats parsing is a pure module — `supabase/functions/poll-live/parse.ts` (`mapStatus`,
`getStat`, `liveMinuteOf`, `parsePlayers`) — so it's unit-tested (`parse.test.ts`)
against a real captured live response (`__fixtures__/bra-mar-live.json`). `index.ts`
keeps only the network/DB orchestration.

**Live minutes (hard-won, cost a debugging round)**: FotMob attaches the per-player
`Minutes played` stat ONLY once a match is `finished`. During live play that label is
absent for everyone — so the old parser (`minutes = getStat('Minutes played') ?? 0;
if (minutes <= 0) continue`) skipped EVERY on-pitch player, wrote no rows, and live
matches scored 0 until full time (the real-FotMob live path was never exercised — only
finished matches and psql-simulated rows were). Fix: when `Minutes played` is missing
but the player has populated `stats` sections (a rating ⇒ on the pitch, not an unused
sub), `parsePlayers` falls back to `liveMinutes` (the match clock from
`header.status.liveTime`, parsed by `liveMinuteOf`). Approximate (a recent sub is
over-credited until FT overwrites it with the real value) but it makes appearance +
goal/assist/card points appear live. Bench players (empty `stats`) still get no row.

FotMob matchDetails facts (verified vs the real Mexico–RSA opener, 2026-06-11):
- `content.playerStats` (keyed by player id): labels `Minutes played`, `Goals`,
  `Assists`, `Saves`, `Goals conceded`, `FotMob rating`
- **`Minutes played` is present ONLY when the match is `finished`** — during live play
  it's absent for every player (on-pitch players still have a `FotMob rating` and other
  stat sections; unused subs have an empty `stats: []`). The live match minute is at
  `header.status.liveTime` (`short` "31’", `long` "30:50"). See poll-live live-minutes fix.
- **`Goals conceded` label exists only for goalkeepers** — outfielders fall back to
  team-level conceded from `header.teams` scores (full-match approximation; a sub who
  came on after all goals still gets them attributed)
- Cards / own goals / pen misses / pen saves only appear as `content.lineup.{homeTeam,awayTeam}`
  `performance.events` — verified type strings: `goal`, `assist`, `yellowCard`, `redCard`,
  `ownGoal`, **`missedPenalty`** (the taker), **`savedPenalty`** (the keeper who saved it).
  The per-player `Missed penalty` / `Saved penalties` STAT labels (note: `Saved penalties`,
  NOT `Penalties saved`) only appear once a match is FINISHED — like `Minutes played` — so
  `parsePlayers` reads pen miss/save from EVENTS only (present live AND at FT; reading both
  the event and the stat would double-count). Verified vs Poland 0–2 Argentina, WC2022
  match 3854576 (Messi missed, Szczesny saved).
- `header.teams` is [home, away]
- Players without a Minutes-played label get no stats row (unused bench)
- **Coach of the Day inputs** (parsed in `parse.ts`, written by `index.ts`):
  `is_sub` from `lineup.{home,away}Team.subs[].performance.substitutionEvents` (type
  `subIn`); `motm_player_id` from `matchFacts.playerOfTheMatch.id`; coach cards from
  `matchFacts.events.events[]` where `cardDescription.localizedKey==='coach'` (the event's
  `player.id` IS the coach id = `coaches.id`; `card` `Yellow`/`Red`/`YellowRed`,
  YellowRed = a red) → `coach_match_stats`. `index.ts` also upserts both managers into
  `coaches` from the lineup so the card FK always resolves — **best-effort**:
  `coaches.team_id` is UNIQUE, so a mid-season manager change collides with the sacked
  coach's row; the error is logged (cards skipped for that fixture) and never fails the
  fixture or trips the stale-data heartbeat. Fix the row by hand, or model coach history
  (follow-up). **Redeploy poll-live.**

## Commands

```bash
npm start            # dev server (press i for iOS, w for web)
npm run ios          # dev server + open iOS simulator (Expo Go)
npm run web          # dev server + open web
npm run typecheck    # tsc --noEmit — run before claiming any change works
npm run lint         # expo lint
npm test             # vitest (scoring rules + scoring-copy drift guard)
npm run sync:scoring # copy src/shared/scoring.ts → supabase/functions/_shared/
npx expo export --platform web   # production web build (catches bundling issues)
```

## Verified working (2026-06-11)

- `npm run typecheck` clean
- `npx expo export --platform web` — bundles, NativeWind CSS extracted, static routes render
- iOS simulator (iPhone 17 Pro, Expo Go) — app boots and renders home screen

- DB migration applied on local Supabase (Docker); leaderboard math + RLS verified with
  seeded test data (captain ×2, team GD scoring, locked-roster denial, reference-table denial)
- ingest-fotmob run against the REAL FotMob API on local stack: seed = 48 teams /
  72 fixtures / 1241 players, zero failures; daily mode idempotent on re-run; EST
  game_day confirmed (June 12 02:00 UTC kickoff → game_day June 11); anon key → 401
- scoring: 20 vitest cases pass (positions, 60-min gates, cards, pens, bonus ties, drift guard)
- poll-live run against the real finished opener: 31 player stat rows, points hand-verified
  (e.g. DEF 76min+assist+CS=9, GK CS+2saves=6, bonus 3/2/1 by rating); idle path returns
  active:0 with no FotMob calls; re-poll overwrites idempotently
- auth E2E on local stack via REST: OTP email arrives with 6-digit code (custom template),
  verify returns session, onboarding PATCH works, avatar upload to own folder OK /
  foreign folder 403 / public read 200; sign-in screen renders on iOS sim, web bundles clean

## Roadmap / not yet built

- Auth flow, real API functions (api.ts is a stub); push to hosted Supabase (see DEPLOYMENT.md)
- Per-minute-on-pitch goals-conceded attribution (currently full-match approximation for
  outfielders; see Live polling section)
- Railway web deploy + EAS iOS build (steps documented in DEPLOYMENT.md)
- Feature implementations (all `src/features/*` are placeholders)
- Push notification registration flow (expo-notifications installed, not wired)
- Light theme
