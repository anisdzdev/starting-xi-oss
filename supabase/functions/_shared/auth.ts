// Service-role gate for cron / ops-only edge functions.
//
// These functions run with verify_jwt = true (Supabase default — there is no
// per-function override in config.toml), so the platform has ALREADY validated
// the JWT signature before our code runs. A valid anon or user token also passes
// that gate, so we must additionally confirm the *role*.
//
// We decode the (already-signature-verified) payload and require
// role === 'service_role'. We deliberately do NOT require the bearer to be
// byte-identical to Deno.env SUPABASE_SERVICE_ROLE_KEY: on projects using the new
// JWT signing keys, the service_role key injected into the function can differ
// from the dashboard / Vault service_role key even though BOTH are valid — that
// mismatch silently 401s every cron call (this exact bug bit the hosted project).
//
// SECURITY: the role check is only sound because verify_jwt is enabled. If these
// functions are ever deployed with --no-verify-jwt, a forged unsigned
// role:service_role token would pass. Keep verify_jwt on for these functions.

/** base64url segment → utf-8 string. */
function decodeSegment(seg: string): string {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(seg.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The `role` claim of a JWT, or null if it can't be parsed. */
export function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(decodeSegment(payload)) as { role?: unknown };
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

/**
 * True when the request carries a service_role token. Fast-paths an exact match
 * against the injected key, then falls back to the role claim (see file header).
 */
export function isServiceRole(req: Request, injectedKey?: string): boolean {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  if (injectedKey && token === injectedKey.trim()) return true;
  return jwtRole(token) === 'service_role';
}
