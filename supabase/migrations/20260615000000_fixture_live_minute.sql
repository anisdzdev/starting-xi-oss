-- Real match clock for the Live Activity scoreboard.
--
-- The Live Activity previously approximated the minute from kickoff time, which
-- overshoots once halftime + stoppage accumulate (showed "90+'" at the 66th
-- minute). poll-live now writes FotMob's actual live clock here each cycle
-- (e.g. "66'", "90+2'"); null whenever the fixture isn't in play.
-- buildActivityState prefers this over the approximation.

alter table public.fixtures add column if not exists live_minute text;
