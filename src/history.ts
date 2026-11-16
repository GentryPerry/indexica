import type { Els } from './types';

/** One object's change: its JSON before (b) and after (a). null means "did not exist". */
export interface Patch { id: string; a: string | null; b: string | null }

/**
 * Undo/redo by diffing. Callers mutate the element map freely, then call commit();
 * the diff against the last committed state becomes one undo step.
 */
export class History {
  private shadow: Record<string, string> = {};
  undo: Patch[][] = [];
  redo: Patch[][] = [];
  constructor(private limit = 300) {}

  reset(els: Els) {
    this.shadow = {};
    for (const [k, v] of Object.entries(els)) this.shadow[k] = JSON.stringify(v);
    this.undo = [];
    this.redo = [];
  }

  /** Record changes since the last commit. Returns true if anything changed. */
  commit(els: Els): boolean {
    const patches: Patch[] = [];
    for (const id of new Set([...Object.keys(this.shadow), ...Object.keys(els)])) {
      const a = els[id] ? JSON.stringify(els[id]) : null;
      const b = this.shadow[id] ?? null;
      if (a === b) continue;
      patches.push({ id, a, b });
      if (a) this.shadow[id] = a; else delete this.shadow[id];
    }
    if (!patches.length) return false;
    this.undo.push(patches);
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo = [];
    return true;
  }

  /** Apply one undo or redo step to els. Returns ids that were removed, or null if there was nothing to do. */
  step(els: Els, dir: 'undo' | 'redo'): string[] | null {
    const from = dir === 'undo' ? this.undo : this.redo;
    const to = dir === 'undo' ? this.redo : this.undo;
    const patches = from.pop();
    if (!patches) return null;
    to.push(patches);
    const gone: string[] = [];
    for (const p of patches) {
      const v = dir === 'undo' ? p.b : p.a;
      if (v) { els[p.id] = JSON.parse(v); this.shadow[p.id] = v; }
      else { delete els[p.id]; delete this.shadow[p.id]; gone.push(p.id); }
    }
    return gone;
  }
}
