import { describe, expect, it } from 'vitest';

import { buildApnsRequest, makeApnsJwt } from './apns.ts';

const b64url = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');
const decodeJson = (seg: string) =>
  JSON.parse(Buffer.from(b64url(seg), 'base64').toString('utf8'));

/** Generate a throwaway P-256 key, return its pkcs8 PEM + the public CryptoKey. */
async function makeTestKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

describe('makeApnsJwt', () => {
  it('produces an ES256 JWT with the key id and team id', async () => {
    const { pem } = await makeTestKey();
    const jwt = await makeApnsJwt({ keyId: 'KEY123', teamId: 'TEAM456', p8: pem }, 1_700_000_000);

    const [h, p] = jwt.split('.');
    expect(jwt.split('.')).toHaveLength(3);
    expect(decodeJson(h)).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(decodeJson(p)).toMatchObject({ iss: 'TEAM456', iat: 1_700_000_000 });
  });

  it('signs so the signature verifies against the public key', async () => {
    const { pem, publicKey } = await makeTestKey();
    const jwt = await makeApnsJwt({ keyId: 'K', teamId: 'T', p8: pem }, 1_700_000_000);

    const [h, p, sig] = jwt.split('.');
    const data = new TextEncoder().encode(`${h}.${p}`);
    const signature = Buffer.from(b64url(sig), 'base64');
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      data
    );
    expect(ok).toBe(true);
  });
});

describe('buildApnsRequest', () => {
  const base = {
    token: 'DEVICE_TOKEN',
    topic: 'com.novem.startingxi',
    contentState: { totalPoints: 31 },
    nowSec: 1_700_000_000,
  };

  it('targets the prod APNs host and the liveactivity push type', () => {
    const req = buildApnsRequest('JWT', { ...base, event: 'update', env: 'prod' });
    expect(req.url).toBe('https://api.push.apple.com/3/device/DEVICE_TOKEN');
    expect(req.headers['apns-push-type']).toBe('liveactivity');
    expect(req.headers['apns-topic']).toBe('com.novem.startingxi.push-type.liveactivity');
    expect(req.headers.authorization).toBe('bearer JWT');
  });

  it('targets the sandbox host when env is sandbox', () => {
    const req = buildApnsRequest('JWT', { ...base, event: 'update', env: 'sandbox' });
    expect(req.url).toBe('https://api.sandbox.push.apple.com/3/device/DEVICE_TOKEN');
  });

  it('builds an update payload with timestamp, event and content-state', () => {
    const req = buildApnsRequest('JWT', { ...base, event: 'update', env: 'prod' });
    const body = JSON.parse(req.body);
    expect(body.aps).toMatchObject({
      timestamp: 1_700_000_000,
      event: 'update',
      'content-state': { totalPoints: 31 },
    });
    expect(body.aps['attributes-type']).toBeUndefined();
  });

  it('includes attributes + attributes-type on a start payload', () => {
    const req = buildApnsRequest('JWT', {
      ...base, event: 'start', env: 'prod',
      attributes: { userId: 'u1', gameDay: '2026-06-14' },
      attributesType: 'StartingXIAttributes',
    });
    const body = JSON.parse(req.body);
    expect(body.aps.event).toBe('start');
    expect(body.aps['attributes-type']).toBe('StartingXIAttributes');
    expect(body.aps.attributes).toEqual({ userId: 'u1', gameDay: '2026-06-14' });
  });

  it('ALWAYS includes an alert on a start payload (iOS push-to-start requirement)', () => {
    // liveactivitiesd rejects a start push with "Received start without an alert
    // configuration" — APNs still returns 200, so the activity silently never appears.
    const req = buildApnsRequest('JWT', {
      ...base, event: 'start', env: 'prod',
      attributes: { userId: 'u1', gameDay: '2026-06-14' },
      attributesType: 'StartingXIAttributes',
    });
    const alert = JSON.parse(req.body).aps.alert;
    expect(alert).toBeDefined();
    expect(alert.title).toBeTruthy();
    expect(alert.body).toBeTruthy();
  });

  it('uses a caller-provided alert on start when given', () => {
    const req = buildApnsRequest('JWT', {
      ...base, event: 'start', env: 'prod',
      attributes: {}, attributesType: 'X',
      alert: { title: 'Kickoff', body: 'CAN vs MAR' },
    });
    expect(JSON.parse(req.body).aps.alert).toEqual({ title: 'Kickoff', body: 'CAN vs MAR' });
  });

  it('does not add an alert to an update payload', () => {
    const req = buildApnsRequest('JWT', { ...base, event: 'update', env: 'prod' });
    expect(JSON.parse(req.body).aps.alert).toBeUndefined();
  });

  it('includes a dismissal-date on an end payload', () => {
    const req = buildApnsRequest('JWT', {
      ...base, event: 'end', env: 'prod', dismissSec: 1_700_000_600,
    });
    const body = JSON.parse(req.body);
    expect(body.aps.event).toBe('end');
    expect(body.aps['dismissal-date']).toBe(1_700_000_600);
  });
});
