/**
 * Boolean operations, outline stroke, and flatten. Pieces are turned into regions (polygons with
 * holes, curves cut into short straight pieces), combined with polygon-clipping, and turned back into
 * vector paths, with runs of short gentle segments refitted as smooth curves so results stay editable.
 */
import pc from 'polygon-clipping';
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping';
import { diamondPath, ellipsePath, flatten, fromD, mapPaths, rectPath, simplify, smoothThrough, worldPaths, type SubPath, type VNode } from './vector';
import { presetDef, presetPaths } from './presetgeom';
import type { El } from './types';

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude';
export const BOOL_LABELS: Record<BoolOp, string> = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' };

/** Shapes that can take part in booleans. */
export const BOOLEABLE = new Set(['path', 'rect', 'ellipse', 'diamond', 'sticky', 'card', 'image', 'table']);

const rotateSubs = (e: El, subs: SubPath[]) => {
  if (!e.rot) return subs;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, a = (e.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return mapPaths(subs, (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

/** A piece's outline as subpaths in board coordinates, rotation applied. */
export function outlineOf(e: El): SubPath[] {
  let local: SubPath[];
  if (e.type === 'path') return rotateSubs(e, worldPaths(e));
  if (e.type === 'pen') return rotateSubs(e, mapPaths([smoothThrough(simplify(e.pts || [], 1.2))], (x, y) => [e.x + x, e.y + y]));
  if (e.type === 'ellipse') local = ellipsePath(e.w, e.h);
  else if (e.type === 'diamond') local = diamondPath(e.w, e.h);
  else if (e.type === 'rect' && e.preset && presetDef(e.preset)) local = presetPaths(presetDef(e.preset)!, e.w, e.h, e.adj).filter(p => p.fill !== 'none').flatMap(p => fromD(p.d));
  else if (e.type === 'rect') local = rectPath(e.w, e.h, Math.min(10, e.w / 4, e.h / 4));
  else if (e.type === 'card') local = rectPath(e.w, e.h, 10);
  else if (e.type === 'sticky') local = rectPath(e.w, e.h, 3);
  else local = rectPath(e.w, e.h);
  return rotateSubs(e, mapPaths(local, (x, y) => [e.x + x, e.y + y]));
}

const closeRing = (pts: number[][]): Ring => {
  const r = pts.map(p => [p[0], p[1]] as [number, number]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]);
  return r;
};

/** The area inside a set of subpaths, even-odd: overlapping rings cut holes. Open subpaths count as closed. */
export function regionOf(subs: SubPath[], tol = 1): MultiPolygon {
  const rings = subs.map(sp => flatten({ ...sp, closed: true }, tol)).filter(r => r.length >= 3).map(r => [closeRing(r)] as Polygon);
  if (!rings.length) return [];
  return rings.length === 1 ? [rings[0]] : pc.xor(rings[0], ...rings.slice(1));
}

/** Combines regions. Subtract removes every later region from the first (the bottom one). */
export function combine(op: BoolOp, regions: MultiPolygon[]): MultiPolygon {
  const [a, ...rest] = regions.filter(r => r.length);
  if (!a) return [];
  if (!rest.length) return a;
  if (op === 'union') return pc.union(a, ...rest);
  if (op === 'intersect') return pc.intersection(a, ...rest);
  if (op === 'exclude') return pc.xor(a, ...rest);
  return pc.difference(a, ...rest);
}

/**
 * One ring back into a subpath. Corners stay corners; runs of short segments that turn gently (the
 * leftovers of a flattened curve) get smooth handles through their points.
 */
export function refitRing(ring: number[][], eps = 0.3): SubPath | null {
  let pts = ring.slice();
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }
  pts = simplify([...pts, pts[0]], eps).slice(0, -1);
  const n = pts.length;
  if (n < 3) return null;
  const at = (i: number) => pts[(i + n) % n], len = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const turn = (i: number) => {
    const a = at(i - 1), b = at(i), c = at(i + 1), u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(v - u); if (d > Math.PI) d = 2 * Math.PI - d; return d;
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const nodes: VNode[] = pts.map((p, i) => {
    const prev = at(i - 1), next = at(i + 1), short = Math.max(len(prev, p), len(p, next)) < 24;
    const node: VNode = { x: r2(p[0]), y: r2(p[1]) };
    if (short && turn(i) < 0.6) {
      const tx = (next[0] - prev[0]) / 6, ty = (next[1] - prev[1]) / 6;
      Object.assign(node, { ix: r2(p[0] - tx), iy: r2(p[1] - ty), ox: r2(p[0] + tx), oy: r2(p[1] + ty), s: true });
    }
    return node;
  });
  return { closed: true, nodes };
}

/** A region as subpaths (outer rings and holes alike; draw with the even-odd rule). */
export function subsOfRegion(region: MultiPolygon): SubPath[] {
  return region.flatMap(poly => poly.map(ring => refitRing(ring))).filter((sp): sp is SubPath => !!sp);
}

/**
 * The area a stroke covers, as a region: each straight piece becomes a band `width` wide, and round
 * caps and joins are added at every point, so the outline matches a round-capped stroke.
 */
const bend = (a: number[], b: number[], c: number[]) => {
  const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(v - u); if (d > Math.PI) d = 2 * Math.PI - d; return d;
};

export function strokeRegion(subs: SubPath[], width: number, tol = 1): MultiPolygon {
  const r = width / 2, parts: Polygon[] = [];
  const disc = (x: number, y: number): Polygon => {
    const k = Math.max(8, Math.min(32, Math.ceil(r * 1.5))), ring: Ring = [];
    for (let i = 0; i <= k; i++) { const a = (i / k) * Math.PI * 2; ring.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    return [ring];
  };
  for (const sp of subs) {
    const pts = flatten(sp, tol);
    if (sp.closed && pts.length > 1) pts.push(pts[0]);
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i], end = !sp.closed && (i === 0 || i === pts.length - 1);
      // Round caps at open ends, and round joins wherever the line turns enough to open a gap.
      if (end || (i > 0 && i < pts.length - 1 && bend(pts[i - 1], pts[i], pts[i + 1]) > 0.08) || (sp.closed && i === 0 && pts.length > 2 && bend(pts[pts.length - 2], pts[0], pts[1]) > 0.08)) parts.push(disc(x, y));
      if (i === 0) continue;
      const [px, py] = pts[i - 1], dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const nx = (-dy / d) * r, ny = (dx / d) * r;
      parts.push([[[px + nx, py + ny], [x + nx, y + ny], [x - nx, y - ny], [px - nx, py - ny], [px + nx, py + ny]]]);
    }
  }
  if (!parts.length) return [];
  return pc.union(parts[0], ...parts.slice(1));
}
