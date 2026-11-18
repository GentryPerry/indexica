import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { verifyAccess, resetKeyCache } from '../worker/access';
import { handleApi, type Db } from '../worker/api';

const TEAM = 'https://gentry-perry.cloudflareaccess.com';
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
let priv: CryptoKey, jwk: JsonWebKey, other: CryptoKey;
async function sign(body: Record<string, unknown>, key = priv, kid = 'k1') {
  const head = enc({ alg: 'RS256', kid, typ: 'JWT' }), payload = enc(body);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + payload));
  return head + '.' + payload + '.' + b64u(new Uint8Array(sig));
}
const keys = async () => ({ keys: [{ kid: 'k1', kty: 'RSA', n: jwk.n!, e: jwk.e! }] });
const good = () => ({ iss: TEAM, aud: ['app1'], email: 'Gentry@Example.com', exp: Math.floor(Date.now() / 1000) + 600 });

beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const a = await gen(), b = await gen();
  priv = a.privateKey; other = b.privateKey; jwk = await crypto.subtle.exportKey('jwk', a.publicKey);
});
beforeEach(() => resetKeyCache());

describe('Cloudflare Access token check', () => {
  it('accepts a valid token and lowercases the email', async () => {
    expect(await verifyAccess(await sign(good()), TEAM, 'app1', keys)).toEqual({ email: 'gentry@example.com' });
  });
  it('rejects a missing, forged, expired, foreign, or wrong-app token', async () => {
    expect(await verifyAccess(null, TEAM, undefined, keys)).toBeNull();
    expect(await verifyAccess(await sign(good(), other), TEAM, undefined, keys)).toBeNull();
    expect(await verifyAccess(await sign({ ...good(), exp: 1 }), TEAM, undefined, keys)).toBeNull();
    expect(await verifyAccess(await sign({ ...good(), iss: 'https://evil.cloudflareaccess.com' }), TEAM, undefined, keys)).toBeNull();
    expect(await verifyAccess(await sign(good()), TEAM, 'app2', keys)).toBeNull();
    const t = await sign(good()), [h, , s] = t.split('.');
    expect(await verifyAccess([h, enc({ ...good(), email: 'someone@else.com' }), s].join('.'), TEAM, undefined, keys)).toBeNull();
  });
});

function fakeDb(): Db & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    prepare(sql: string) {
      return { bind: (...v: unknown[]) => ({
        first: async <T,>() => (sql.startsWith('SELECT') && rows.has(v[0] + '|' + v[1]) ? { data: rows.get(v[0] + '|' + v[1]) } as T : null),
        run: async () => { if (sql.startsWith('INSERT')) rows.set(v[0] + '|' + v[1], String(v[2])); else if (sql.startsWith('DELETE')) rows.delete(v[0] + '|' + v[1]); return {}; },
      }) };
    },
  };
}

describe('sync API', () => {
  const env = (db: Db) => ({ DB: db, TEAM_DOMAIN: TEAM });
  const me = { email: 'gentry@example.com' };
  const req = (path: string, method = 'GET', body?: unknown) => new Request('https://jam.gentryperry.com' + path, { method, body: body ? JSON.stringify(body) : undefined });
  it('refuses requests without a signed-in person', async () => {
    expect((await handleApi(req('/api/me'), env(fakeDb()), null)).status).toBe(401);
  });
  it('saves, reads, and deletes a person\'s documents', async () => {
    const db = fakeDb();
    expect(await (await handleApi(req('/api/me'), env(db), me)).json()).toEqual({ id: me.email, email: me.email });
    expect((await handleApi(req('/api/docs/index'), env(db), me)).status).toBe(404);
    expect((await handleApi(req('/api/docs/index', 'PUT', { json: '{"boards":[]}' }), env(db), me)).status).toBe(200);
    expect(await (await handleApi(req('/api/docs/index'), env(db), me)).json()).toEqual({ json: '{"boards":[]}' });
    expect((await handleApi(req('/api/docs/index'), env(db), { email: 'other@example.com' })).status).toBe(404);
    await handleApi(req('/api/docs/index', 'DELETE'), env(db), me);
    expect(db.rows.size).toBe(0);
  });
  it('rejects bad ids and bodies', async () => {
    const db = fakeDb();
    expect((await handleApi(req('/api/docs/..%2Fx'), env(db), me)).status).toBe(404);
    expect((await handleApi(req('/api/docs/a', 'PUT', { json: 5 }), env(db), me)).status).toBe(400);
  });
});
