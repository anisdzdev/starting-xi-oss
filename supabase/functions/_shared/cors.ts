// CORS headers for edge functions invoked from the browser.
//
// `supabase-js` functions.invoke() sends custom headers (authorization, apikey,
// content-type, x-client-info), which makes the browser fire a preflight OPTIONS
// request. A function that does not answer OPTIONS with these headers — or omits
// Access-Control-Allow-Origin on its real responses — is blocked by the browser,
// and supabase-js surfaces it as the opaque "Failed to send a request to the
// Edge Function" (a fetch-layer failure, FunctionsFetchError).
//
// Any function that the APP calls directly (scout-card, send-push) MUST:
//   1. short-circuit OPTIONS → `new Response('ok', { headers: corsHeaders })`
//   2. include corsHeaders on every real response.
// Cron/service-only functions (poll-live, ingest-fotmob) never need this.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
