/**
 * Live booleans, as in Figma: combining shapes makes a result vector (`live` holds the operation)
 * while the shapes themselves stay on the board as its operands (`boolIn` names the result). Operands
 * are not drawn; the result is recomputed from them whenever they change, so they can be moved,
 * resized, or reshaped afterwards. Flatten bakes the result into a plain vector; ungrouping releases
 * the operands again. Results can be operands of other results.
 */
import { combine as polyCombine, outlineOf, regionOf, subsOfRegion, type BoolOp } from './boolean';
import * as X from './exact';
import { flatten, setWorldPaths, type SubPath } from './vector';
import type { El } from './types';

export type Els = Record<string, El>;

/** The direct operands of a result, bottom first (that order decides what subtract cuts from). */
export const operandsOf = (els: Els, id: string): El[] => Object.values(els).filter(e => e.boolIn === id).sort((a, b) => a.z - b.z);

/** Every operand under a result, nested ones included. */
export function descendantsOf(els: Els, id: string): El[] {
  const out: El[] = [];
  for (const e of operandsOf(els, id)) { out.push(e); if (e.live) out.push(...descendantsOf(els, e.id)); }
  return out;
}

/** The outermost result an element belongs to (itself when it is not an operand). */
export function rootOf(els: Els, e: El): El {
  let cur = e;
  for (let i = 0; i < 32 && cur.boolIn && els[cur.boolIn]; i++) cur = els[cur.boolIn];
  return cur;
}

/** Whether `e` sits somewhere under the result `id`. */
export function isUnder(els: Els, e: El, id: string): boolean {
  let cur: El | undefined = e;
  for (let i = 0; i < 32 && cur && cur.boolIn; i++) { if (cur.boolIn === id) return true; cur = els[cur.boolIn]; }
  return false;
}

/** The combined outline of a set of operands: VectorCraft's exact engine, or polygons when it is not loaded. */
export function liveGeometry(op: BoolOp, operands: El[]): SubPath[] {
  const pieces = operands.map(e => ({ subs: outlineOf(e), evenodd: e.type === 'path' && e.rule === 'evenodd' }));
  if (pieces.length === 1) return pieces[0].subs;
  const exact = X.combine(op, pieces);
  if (exact) return exact;
  try { return subsOfRegion(polyCombine(op, pieces.map(p => regionOf(p.subs)))); } catch { return []; }
}

const GEOM = ['type', 'x', 'y', 'w', 'h', 'rot', 'paths', 'vw', 'vh', 'pts', 'rule', 'sw', 'brush', 'z', 'live'] as const;
const sigOf = (result: El, operands: El[]) =>
  JSON.stringify([result.live, result.x, result.y, result.w, result.h, result.rot, operands.map(e => GEOM.map(k => (e as unknown as Record<string, unknown>)[k]))]);

/**
 * Recomputes every live result whose operands (or own box) changed since the last call, inner
 * results first. `seen` remembers what each result was computed from. Returns the ids it changed.
 */
export function syncLive(els: Els, seen: Map<string, string>, list: El[] = Object.values(els)): string[] {
  const changed = new Set<string>(), results = list.filter(e => e.live);
  if (!results.length) return [];
  for (let pass = 0; pass < 8; pass++) {
    let any = false;
    for (const r of results) {
      if (!r.live) continue;
      const ops = operandsOf(els, r.id);
      if (!ops.length) continue;
      const sig = sigOf(r, ops);
      if (seen.get(r.id) === sig) continue;
      const subs = liveGeometry(r.live, ops);
      if (subs.length) { setWorldPaths(r, subs); delete r.rot; }
      // Remember what the result now is, so its own new box does not count as a change.
      seen.set(r.id, sigOf(r, ops));
      changed.add(r.id); any = true;
    }
    if (!any) break;
  }
  return [...changed];
}

/**
 * Records every result as up to date without recomputing it, for state that was saved or restored
 * whole (opening a page, undo and redo): stored results are trusted until their operands change.
 */
export function trust(els: Els, seen: Map<string, string>) {
  for (const r of Object.values(els)) if (r.live) seen.set(r.id, sigOf(r, operandsOf(els, r.id)));
}

/** Results with nothing left to combine. */
export const orphans = (els: Els): El[] => Object.values(els).filter(e => e.live && !Object.values(els).some(o => o.boolIn === e.id));

/** Whether a board point is inside a piece's outline (even-odd, open outlines count as closed). */
export function contains(e: El, x: number, y: number): boolean {
  let inside = false;
  for (const sp of outlineOf(e)) {
    const pts = flatten({ ...sp, closed: true }, 1);
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The topmost operand of a result under a board point. */
export function operandAt(els: Els, id: string, x: number, y: number): El | null {
  const ops = operandsOf(els, id);
  for (let i = ops.length - 1; i >= 0; i--) if (contains(ops[i], x, y)) return ops[i];
  return null;
}

/**
 * Bakes a result into a plain vector: its operands are removed and it stops updating.
 * Returns the ids removed.
 */
export function bake(els: Els, id: string): string[] {
  const r = els[id]; if (!r || !r.live) return [];
  const gone = descendantsOf(els, id).map(e => e.id);
  for (const g of gone) delete els[g];
  delete r.live;
  return gone;
}

/**
 * Releases a result: its operands are drawn again on their own and the result is removed. Results
 * among the released operands keep their own operands, in a group of their own.
 */
export function release(els: Els, id: string, newGroup: () => string): El[] {
  const r = els[id]; if (!r || !r.live) return [];
  const ops = operandsOf(els, id);
  for (const e of ops) {
    delete e.boolIn;
    if (r.g) e.g = r.g; else delete e.g;
    if (e.live) { const g = newGroup(); e.g = g; for (const d of descendantsOf(els, e.id)) d.g = g; }
  }
  delete els[id];
  return ops;
}
