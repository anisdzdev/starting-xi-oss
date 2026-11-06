/**
 * APNs delivery for Live Activities.
 *
 * Live Activity pushes CANNOT go through the Expo Push API — they must hit APNs
 * directly with `apns-push-type: liveactivity`. Auth is token-based (a `.p8`
 * APNs Auth Key signed as an ES256 JWT).
 *
 * Pure helpers (Web Crypto, no Deno/network) so they run in the edge function
 * AND are unit-testable in vitest. The edge function reads the key material from
 * env, calls `makeApnsJwt` (cache the result ~50 min), then `buildApnsRequest`
 * per push and `fetch`es it.
 */

export interface ApnsAuth {
  keyId: string;
  teamId: string;
  p8: string; // PKCS#8 PEM contents of the .p8 file
}

export type ApnsEvent = 'start' | 'update' | 'end';

export interface ApnsPushArgs {
  token: string; // push-to-start token (start) OR per-activity token (update/end)
  topic: string; // app bundle id, e.g. com.novem.startingxi
  event: ApnsEvent;
  contentState: unknown;
  nowSec: number;
  env: 'prod' | 'sandbox';
  attributes?: Record<string, unknown>; // start only
  attributesType?: string; // start only
  staleSec?: number;
  dismissSec?: number; // end only
  relevance?: number;
  alert?: { title: string; body: string };
}

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64urlText = (text: string): string =>
  b64url(new TextEncoder().encode(text));

/** Decode a PKCS#8 PEM (the .p8 body) into DER bytes. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/** Sign an APNs provider JWT (ES256). Cache the result for up to ~50 minutes. */
export async function makeApnsJwt(auth: ApnsAuth, nowSec: number): Promise<string> {
  const header = b64urlText(JSON.stringify({ alg: 'ES256', kid: auth.keyId }));
  const payload = b64urlText(JSON.stringify({ iss: auth.teamId, iat: nowSec }));
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(auth.p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  // Web Crypto returns the raw r||s (IEEE P1363) signature — exactly JWS ES256.
  return `${signingInput}.${b64url(sig)}`;
}

const HOSTS = {
  prod: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

export interface ApnsRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Build the HTTP request for one Live Activity push (start/update/end). */
export function buildApnsRequest(jwt: string, a: ApnsPushArgs): ApnsRequest {
  const aps: Record<string, unknown> = {
    timestamp: a.nowSec,
    event: a.event,
    'content-state': a.contentState,
  };
  if (a.relevance != null) aps['relevance-score'] = a.relevance;
  if (a.staleSec != null) aps['stale-date'] = a.staleSec;
  if (a.event === 'start') {
    aps['attributes-type'] = a.attributesType;
    aps.attributes = a.attributes;
    // iOS REQUIRES an alert on a push-to-start payload — without it
    // liveactivitiesd logs "Received start without an alert configuration" and
    // silently drops the start (APNs still returns 200). Default if omitted.
    aps.alert = a.alert ?? { title: 'Starting XI', body: 'Your XI is live' };
  } else if (a.alert) {
    aps.alert = a.alert;
  }
  if (a.event === 'end' && a.dismissSec != null) aps['dismissal-date'] = a.dismissSec;

  return {
    url: `${HOSTS[a.env]}/3/device/${a.token}`,
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-push-type': 'liveactivity',
      'apns-topic': `${a.topic}.push-type.liveactivity`,
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps }),
  };
}
