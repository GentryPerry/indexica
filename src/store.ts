/**
 * Persistence. Uses the viewer's private Claude artifact storage when the app runs as a Claude
 * artifact, the signed-in person's account when it runs on the Cloudflare site (worker/api.ts, behind
 * Cloudflare Access), and localStorage everywhere else. Every write is also mirrored to localStorage
 * as a fallback copy.
 */
interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Collection { doc(id: string): DocRef }
interface ClaudeRuntime { use(name: string): Promise<any> }
declare global { interface Window { claude?: ClaudeRuntime } }

/** Documents saved through the Cloudflare site's API (same origin). Expired sign-ins show as `signed_out`. */
function serverDocs(): Collection {
  const fail = (r: Response) => Object.assign(new Error('save'), { code: r.type === 'opaqueredirect' || r.status === 401 ? 'signed_out' : r.status === 413 ? 'too_large' : '' });
  return {
    doc(id: string) {
      const url = '/api/docs/' + encodeURIComponent(id);
      return {
        async get() {
          const r = await fetch(url, { cache: 'no-store', redirect: 'manual' });
          if (r.status === 404) return { exists: false, data: () => undefined };
          if (!r.ok) throw fail(r);
          const j = await r.json();
          return { exists: true, data: () => j };
        },
        async set(data: Record<string, unknown>) {
          const r = await fetch(url, { method: 'PUT', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
          if (!r.ok) throw fail(r);
        },
        async delete() { await fetch(url, { method: 'DELETE', redirect: 'manual' }); },
      };
    },
  };
}
const shortName = (id: string) => id.split('@')[0];
const queues: Record<string, { next?: string; run?: boolean }> = {};

export const Store = {
  mode: 'local' as 'local' | 'cloud',
  /** Where 'cloud' saves go: the Claude artifact, or the Cloudflare site's account storage. */
  where: '' as '' | 'claude' | 'site',
  max: 240000,
  base: null as Collection | null,
  err: '',
  busy: 0,
  onChange: (() => {}) as () => void,

  local<T = unknown>(k: string, v?: T | null): T | null {
    try {
      if (v === undefined) { const r = localStorage.getItem('ix_' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('ix_' + k); else localStorage.setItem('ix_' + k, JSON.stringify(v));
    } catch { /* storage may be unavailable */ }
    return null;
  },

  /** The viewer, when the page runs as a Claude artifact: an opaque id stored on sticky notes they make. */
  user: null as null | { profiles(ids: string[]): Promise<Record<string, { name?: string }>> },
  uid: '' as string,
  myName: '' as string,
  /** Display names for user ids, looked up fresh (names are never stored). Missing names come back empty. */
  async names(ids: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (this.where === 'site') { for (const id of ids) out[id] = id === this.uid && this.myName ? this.myName : shortName(id); return out; }
    if (!this.user || !ids.length) return out;
    try { const ps = await this.user.profiles(ids); for (const id of ids) out[id] = (ps && ps[id] && ps[id].name) || ''; } catch { /* no names */ }
    return out;
  },

  async init() {
    let framed = false;
    try { framed = window.self !== window.top; } catch { framed = true; }
    for (let i = 0; framed && !window.claude && i < 10; i++) await new Promise(r => setTimeout(r, 100));
    if (!window.claude?.use) { if (!framed) await this.initSite(); return; }
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const id = user && await user.id();
      if (user && id) { this.user = user; this.uid = id; }
      if (db && id) { this.base = db.collection('data/users/' + id); this.mode = 'cloud'; this.where = 'claude'; }
    } catch { /* stay local */ }
  },

  /** On the Cloudflare site, a signed-in person gets their own account storage. Anywhere else this finds no API and stays local. */
  async initSite() {
    if (location.protocol !== 'https:') return;
    try {
      const r = await Promise.race([fetch('/api/me', { cache: 'no-store', redirect: 'manual' }), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 6000))]);
      if (!r.ok) return;
      const me = await r.json() as { id?: string };
      if (!me.id) return;
      this.uid = me.id; this.base = serverDocs(); this.mode = 'cloud'; this.where = 'site'; this.max = 1_800_000;
      // The display name comes from Access's identity endpoint on this same site; the email's first part stands in until then.
      fetch('/cdn-cgi/access/get-identity', { cache: 'no-store', redirect: 'manual' }).then(x => x.ok ? x.json() : null).then(j => { if (j && j.name) { this.myName = String(j.name); this.onChange(); } }).catch(() => {});
    } catch { /* stay local */ }
  },

  /** Every document key this browser holds a copy of. */
  localKeys(): string[] {
    const out: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ix_')) out.push(k.slice(3)); } } catch { /* none */ }
    return out;
  },

  async get<T = unknown>(k: string): Promise<T | null> {
    if (this.mode === 'cloud' && this.base) {
      try {
        const snap = await Promise.race([
          this.base.doc(k).get(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ]);
        return snap.exists ? JSON.parse(String(snap.data()!.json)) : null;
      } catch {
        this.err = 'Could not reach saved data. Showing the copy in this browser.';
        this.onChange();
      }
    }
    return this.local<T>(k);
  },

  put(k: string, v: unknown) {
    this.local(k, v);
    if (this.mode !== 'cloud') return;
    const json = JSON.stringify(v);
    if (json.length > this.max) {
      this.err = 'This board is too large to sync. Remove some drawings to save it.';
      this.onChange();
      return;
    }
    (queues[k] ||= {}).next = json;
    if (!queues[k].run) void this.pump(k);
  },

  /** One write at a time per document; later writes replace queued ones. */
  async pump(k: string) {
    const q = queues[k];
    q.run = true; this.busy++; this.onChange();
    while (q.next !== undefined) {
      const json = q.next; q.next = undefined;
      try { await this.base!.doc(k).set({ json }); this.err = ''; }
      catch (e) {
        const code = (e as { code?: string })?.code;
        this.err = code === 'quota_exceeded' ? 'Storage is full. Delete boards from Trash to keep saving.'
          : code === 'signed_out' ? 'Your sign-in expired. Reload the page to sign in again; changes are kept in this browser until then.'
          : code === 'too_large' ? 'This board is too large to sync. Remove some drawings or pictures to save it.'
          : 'Save failed. Your changes are kept in this browser.';
      }
    }
    q.run = false; this.busy--; this.onChange();
  },

  del(k: string) {
    this.local(k, null);
    if (this.mode === 'cloud' && this.base) this.base.doc(k).delete().catch(() => {});
  },
};
