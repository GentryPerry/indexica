/**
 * Persistence. Uses the viewer's private Claude artifact storage when the app runs
 * as a Claude artifact, and localStorage everywhere else. Every write is also
 * mirrored to localStorage as a fallback copy.
 */
interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Collection { doc(id: string): DocRef }
interface ClaudeRuntime { use(name: string): Promise<any> }
declare global { interface Window { claude?: ClaudeRuntime } }

const MAX_DOC = 240000;
const queues: Record<string, { next?: string; run?: boolean }> = {};

export const Store = {
  mode: 'local' as 'local' | 'cloud',
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
  /** Display names for user ids, looked up fresh (names are never stored). Missing names come back empty. */
  async names(ids: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (!this.user || !ids.length) return out;
    try { const ps = await this.user.profiles(ids); for (const id of ids) out[id] = (ps && ps[id] && ps[id].name) || ''; } catch { /* no names */ }
    return out;
  },

  async init() {
    let framed = false;
    try { framed = window.self !== window.top; } catch { framed = true; }
    for (let i = 0; framed && !window.claude && i < 10; i++) await new Promise(r => setTimeout(r, 100));
    if (!window.claude?.use) return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const id = user && await user.id();
      if (user && id) { this.user = user; this.uid = id; }
      if (db && id) { this.base = db.collection('data/users/' + id); this.mode = 'cloud'; }
    } catch { /* stay local */ }
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
    if (json.length > MAX_DOC) {
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
        this.err = (e as { code?: string })?.code === 'quota_exceeded'
          ? 'Storage is full. Delete boards from Trash to keep saving.'
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
