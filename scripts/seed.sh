#!/usr/bin/env bash
# One-shot environment seed: schema + reference data (formations are seeded by
# migrations; teams/fixtures/squads come from FotMob via ingest seed mode).
#
# Usage:
#   ./scripts/seed.sh local
#   ./scripts/seed.sh https://<PROJECT_REF>.supabase.co $SERVICE_ROLE_KEY
set -euo pipefail

if [[ "${1:-}" == "local" ]]; then
  BASE="http://127.0.0.1:54321"
  KEY="$(supabase status -o env 2>/dev/null | grep '^SERVICE_ROLE_KEY' | cut -d'"' -f2)"
  echo "→ applying migrations (local)"
  supabase migration up
else
  BASE="${1:?usage: seed.sh local | seed.sh <supabase-url> <service-role-key>}"
  KEY="${2:?service role key required}"
  echo "→ applying migrations (linked project)"
  supabase db push
fi

# Season to seed (a row in `seasons`; default = the active one). e.g. SEASON=wc2026
# Build the body with printf so the quotes survive shell parameter expansion.
BODY=$(printf '{"mode":"seed"%s}' "${SEASON:+,\"season\":\"$SEASON\"}")
echo "→ seeding every fixture + squad of season ${SEASON:-<active>} via ingest-fotmob (1–2 min)"
curl -sf -X POST "$BASE/functions/v1/ingest-fotmob" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
echo "→ verifying"
curl -sf -X POST "$BASE/rest/v1/rpc/bump_usage" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"p_fn":"seed-script"}' >/dev/null || true
echo "done — check the summary above (UCL 26/27: 36 teams, 144 league-phase fixtures, ~950 players)"
