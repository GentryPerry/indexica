/**
 * Verifies the sign-in token Cloudflare Access attaches to every request (Cf-Access-Jwt-Assertion):
 * an RS256 JWT signed with the team's keys. Only a valid, unexpired token from this team (and, when
 * configured, for this application) yields the signed-in email.
 */
export interface Identity { email: string }
interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }

const b64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};
const text = (s: string) => new TextDecoder().decode(b64url(s));

let cache: { url: string; at: number; keys: Map<string, CryptoKey> } | null = null;

/** The team's public keys, cached for an hour. `fetchKeys` is swappable for tests. */
async function keysFor(team: string, fetchKeys: (url: string) => Promise<{ keys: Jwk[] }>): Promise<Map<string, CryptoKey>> {
  const url = team.replace(/\/$/, '') + '/cdn-cgi/access/certs';
  if (cache && cache.url === url && Date.now() - cache.at < 3600_000) return cache.keys;
  const { keys } = await fetchKeys(url);
  const map = new Map<string, CryptoKey>();
  for (const k of keys) {
    if (k.kty !== 'RSA') continue;
    map.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  cache = { url, at: Date.now(), keys: map };
  return map;
}

export function resetKeyCache() { cache = null; }

export async function verifyAccess(token: string | null, team: string, aud: string | undefined,
  fetchKeys: (url: string) => Promise<{ keys: Jwk[] }> = async u => (await fetch(u)).json() as Promise<{ keys: Jwk[] }>,
  now = Date.now()): Promise<Identity | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(text(parts[0])), body = JSON.parse(text(parts[1]));
    if (head.alg !== 'RS256') return null;
    const key = (await keysFor(team, fetchKeys)).get(head.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    if (body.iss !== team.replace(/\/$/, '')) return null;
    if (typeof body.exp !== 'number' || body.exp * 1000 < now) return null;
    if (aud && !(Array.isArray(body.aud) ? body.aud : [body.aud]).includes(aud)) return null;
    if (typeof body.email !== 'string' || !body.email) return null;
    return { email: body.email.toLowerCase() };
  } catch {
    return null;
  }
}
