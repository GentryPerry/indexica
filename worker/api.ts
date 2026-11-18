/**
 * The sync API for the Cloudflare deployment: each signed-in person's documents (the board index,
 * boards, templates, pictures) as JSON text in D1, keyed by their email. Same shape the app already
 * saves in a Claude artifact, so the client only swaps where documents go.
 *
 *   GET    /api/me          -> { id, email }
 *   GET    /api/docs/:id    -> { json } or 404
 *   PUT    /api/docs/:id    <- { json }
 *   DELETE /api/docs/:id
 */
import { verifyAccess, type Identity } from './access';

export interface Db {
  prepare(sql: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } };
}
export interface Env { DB: Db; TEAM_DOMAIN: string; ACCESS_AUD?: string }

export const MAX_JSON = 1_800_000;
const DOC_ID = /^[A-Za-z0-9_\-.:]{1,200}$/;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleApi(req: Request, env: Env, who?: Identity | null): Promise<Response> {
  const user = who !== undefined ? who : await verifyAccess(req.headers.get('cf-access-jwt-assertion'), env.TEAM_DOMAIN, env.ACCESS_AUD);
  if (!user) return reply({ error: 'Not signed in' }, 401);
  const path = new URL(req.url).pathname;
  if (path === '/api/me' && req.method === 'GET') return reply({ id: user.email, email: user.email });
  const m = path.match(/^\/api\/docs\/(.+)$/);
  const id = m ? decodeURIComponent(m[1]) : '';
  if (!m || !DOC_ID.test(id)) return reply({ error: 'Not found' }, 404);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM docs WHERE user = ? AND id = ?').bind(user.email, id).first<{ data: string }>();
    return row ? reply({ json: row.data }) : reply({ error: 'Not found' }, 404);
  }
  if (req.method === 'PUT') {
    let json: unknown;
    try { json = ((await req.json()) as { json?: unknown }).json; } catch { return reply({ error: 'Bad request' }, 400); }
    if (typeof json !== 'string') return reply({ error: 'Bad request' }, 400);
    if (json.length > MAX_JSON) return reply({ error: 'Too large' }, 413);
    await env.DB.prepare('INSERT INTO docs (user, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT (user, id) DO UPDATE SET data = excluded.data, updated = excluded.updated')
      .bind(user.email, id, json, Date.now()).run();
    return reply({ ok: true });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM docs WHERE user = ? AND id = ?').bind(user.email, id).run();
    return reply({ ok: true });
  }
  return reply({ error: 'Method not allowed' }, 405);
}
