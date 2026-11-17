/**
 * Exact vector operations through VectorCraft's engine (see pathops.ts), in Indexica's subpath
 * terms. Each function returns null when the engine is not loaded or refuses the input, so callers
 * can fall back to the polygon-based operations in boolean.ts.
 */
import { run, type Operand } from './pathops';
import { fromD, pathD, type SubPath } from './vector';
import type { BoolOp } from './boolean';

export interface Piece { subs: SubPath[]; evenodd?: boolean }

const closedD = (subs: SubPath[]) => pathD(subs.map(sp => ({ ...sp, closed: true })));
const parse = (d: string | null): SubPath[] | null => (d == null ? null : fromD(d));

/** Union, subtract (later pieces cut from the first), intersect, or exclude. Open subpaths count as closed. */
export function combine(op: BoolOp, pieces: Piece[]): SubPath[] | null {
  const ops: Operand[] = pieces.filter(p => p.subs.length).map(p => ({ d: closedD(p.subs), evenodd: p.evenodd }));
  if (ops.length < 2) return null;
  return parse(run(op, [0.01], ops));
}

export type Cap = 'butt' | 'round' | 'square';
export type Join = 'miter' | 'round' | 'bevel';
const CAPS: Cap[] = ['butt', 'round', 'square'], JOINS: Join[] = ['miter', 'round', 'bevel'];

/** The area a stroke of this width covers, as filled outlines. */
export function outlineStroke(subs: SubPath[], width: number, cap: Cap = 'round', join: Join = 'round', miter = 4): SubPath[] | null {
  if (!subs.length || !(width > 0)) return null;
  return parse(run('outline', [width, CAPS.indexOf(cap), JOINS.indexOf(join), miter], [{ d: pathD(subs) }]));
}

/** Grows (positive) or shrinks (negative) a shape by a distance. */
export function offset(subs: SubPath[], delta: number, join: Join = 'round', miter = 4): SubPath[] | null {
  if (!subs.length || !delta) return null;
  return parse(run('offset', [delta, JOINS.indexOf(join), miter], [{ d: pathD(subs) }]));
}

/** Fewer nodes, staying within the tolerance of the original outline. */
export function simplify(subs: SubPath[], tolerance = 1): SubPath[] | null {
  if (!subs.length) return null;
  return parse(run('simplify', [tolerance], [{ d: pathD(subs) }]));
}

/**
 * VectorCraft's Smooth: bumps and jags give way to one curve, then the path is refitted with no more
 * nodes than it had. `level` runs from 0 (barely) to 100 (most). Engines built before that command
 * existed fall back to pulling each node's handles toward a smooth tangent.
 */
export function smooth(subs: SubPath[], level = 50): SubPath[] | null {
  if (!subs.length) return null;
  const d = pathD(subs);
  return parse(run('smoothlevel', [level], [{ d }]) ?? run('smooth', [Math.min(1, level / 100)], [{ d }]));
}
