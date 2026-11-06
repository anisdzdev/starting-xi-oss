-- Game-day cutoff (6am ET).
--
-- A "game day" runs from one afternoon through 6am ET the next morning, NOT
-- midnight, so late kickoffs (up to ~2am ET, even into extra time) belong to the
-- prior evening's slate. Recompute fixtures.game_day from kickoff_utc under the
-- new rule.
--
-- MUST stay in sync with GAME_DAY_CUTOFF_HOUR in src/shared/gameday.ts
-- (currently 6). The expression below mirrors gameDayOf(): shift the instant
-- back by the cutoff, then take the US-Eastern calendar date. Deterministic —
-- derived purely from kickoff_utc — and idempotent (only rows whose stored
-- game_day differs are touched).
update fixtures
set game_day = (timezone('America/New_York', kickoff_utc - interval '6 hours'))::date
where game_day
  is distinct from (timezone('America/New_York', kickoff_utc - interval '6 hours'))::date;

-- NOTE: rosters / tournament_picks / nudges / scout_cards are keyed by game_day.
-- A roster built for a late game's OLD (post-midnight) day will no longer match
-- that game's new game_day. This is acceptable for the current friends-league
-- test data; if it matters, those rows can be re-pointed or the affected user
-- can rebuild. Reference/stats aggregation self-corrects (everything joins
-- through fixtures / player_match_stats).
