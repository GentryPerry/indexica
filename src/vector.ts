/**
 * Vector paths. A path element holds subpaths of Bezier nodes in its own coordinate box (vw by vh,
 * origin at its top-left), drawn stretched to the element's w by h like an SVG viewBox, so resizing
 * needs no special handling. Each node has optional in and out handles in the same coordinates.
 */
import type { El } from './types';

export interface VNode {
  x: number; y: number;
  /** Handle toward the previous node. */
  ix?: number; iy?: number;
  /** Handle toward the next node. */
  ox?: number; oy?: number;
  /** Smooth node: its two handles stay in line. */
  s?: boolean;
}
export interface SubPath { nodes: VNode[]; closed?: boolean }
export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

const r2 = (v: number) => Math.round(v * 100) / 100;
const outOf = (n: VNode): Pt => ({ x: n.ox ?? n.x, y: n.oy ?? n.y });
const inOf = (n: VNode): Pt => ({ x: n.ix ?? n.x, y: n.iy ?? n.y });

export const segCount = (sp: SubPath) => (sp.nodes.length < 2 ? 0 : sp.closed ? sp.nodes.length : sp.nodes.length - 1);

/** The four control points of segment i of a subpath. */
export function segment(sp: SubPath, i: number): [Pt, Pt, Pt, Pt] {
  const a = sp.nodes[i], b = sp.nodes[(i + 1) % sp.nodes.length];
  return [{ x: a.x, y: a.y }, outOf(a), inOf(b), { x: b.x, y: b.y }];
}

export function cubicAt([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

const isLine = (s: [Pt, Pt, Pt, Pt]) => s[1].x === s[0].x && s[1].y === s[0].y && s[2].x === s[3].x && s[2].y === s[3].y;

/** SVG path data, offset by (ox, oy) and stretched by (sx, sy). */
export function pathD(subs: SubPath[], ox = 0, oy = 0, sx = 1, sy = 1): string {
  const f = (p: Pt) => `${r2(ox + p.x * sx)} ${r2(oy + p.y * sy)}`;
  let d = '';
  for (const sp of subs) {
    if (!sp.nodes.length) continue;
    d += 'M' + f(sp.nodes[0]);
    for (let i = 0, n = segCount(sp); i < n; i++) {
      const s = segment(sp, i);
      // Z draws a straight closing segment by itself.
      if (isLine(s)) { if (!(sp.closed && i === n - 1)) d += 'L' + f(s[3]); }
      else d += 'C' + f(s[1]) + ' ' + f(s[2]) + ' ' + f(s[3]);
    }
    if (sp.closed) d += 'Z';
  }
  return d;
}

/** Parameter values in (0, 1) where one coordinate of a cubic turns around. */
function extremaT(a: number, b: number, c: number, d: number): number[] {
  const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), C = b - a, out: number[] = [];
  if (Math.abs(A) < 1e-9) { if (Math.abs(B) > 1e-9) out.push(-C / B); }
  else { const disc = B * B - 4 * A * C; if (disc >= 0) { const q = Math.sqrt(disc); out.push((-B + q) / (2 * A), (-B - q) / (2 * A)); } }
  return out.filter(t => t > 0 && t < 1);
}

/** The tight bounding box of the curves, not just the control points. */
export function bounds(subs: SubPath[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: Pt) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
  for (const sp of subs) {
    sp.nodes.forEach(add);
    for (let i = 0; i < segCount(sp); i++) {
      const s = segment(sp, i);
      for (const t of [...extremaT(s[0].x, s[1].x, s[2].x, s[3].x), ...extremaT(s[0].y, s[1].y, s[2].y, s[3].y)]) add(cubicAt(s, t));
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Applies a point transform to every node and handle. */
export function mapPaths(subs: SubPath[], f: (x: number, y: number) => [number, number]): SubPath[] {
  return subs.map(sp => ({
    closed: sp.closed,
    nodes: sp.nodes.map(n => {
      const [x, y] = f(n.x, n.y), m: VNode = { x: r2(x), y: r2(y) };
      if (n.ix != null && n.iy != null) { const [a, b] = f(n.ix, n.iy); m.ix = r2(a); m.iy = r2(b); }
      if (n.ox != null && n.oy != null) { const [a, b] = f(n.ox, n.oy); m.ox = r2(a); m.oy = r2(b); }
      if (n.s) m.s = true;
      return m;
    }),
  })).map(sp => (sp.closed ? sp : (delete sp.closed, sp)));
}

/** Scale from the path's own box to board units. */
export function scaleOf(e: El): { sx: number; sy: number } {
  return { sx: e.vw ? e.w / e.vw : 1, sy: e.vh ? e.h / e.vh : 1 };
}

/** The element's subpaths in board coordinates (rotation not applied). */
export function worldPaths(e: El): SubPath[] {
  const { sx, sy } = scaleOf(e);
  return mapPaths(e.paths || [], (x, y) => [e.x + x * sx, e.y + y * sy]);
}

/**
 * Sets an element's subpaths from board coordinates: the box is fitted to the curves and the nodes are
 * stored relative to it, so the element's size matches what is drawn.
 */
export function setWorldPaths(e: El, subs: SubPath[]) {
  const b = bounds(subs) || { x: e.x, y: e.y, w: 0, h: 0 };
  e.paths = mapPaths(subs, (x, y) => [x - b.x, y - b.y]);
  e.x = r2(b.x); e.y = r2(b.y); e.w = e.vw = r2(b.w); e.h = e.vh = r2(b.h);
}

/**
 * Like setWorldPaths, for a path whose geometry changed in its own (unrotated) frame: when the
 * element is rotated, the box is shifted so that every unchanged point stays where it was drawn,
 * rather than the shape swinging about its new center.
 */
export function placeWorldPaths(e: El, subs: SubPath[]) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  setWorldPaths(e, subs);
  if (!e.rot) return;
  const a = (e.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = e.x + e.w / 2 - cx, dy = e.y + e.h / 2 - cy;
  e.x = r2(e.x + (c - 1) * dx - s * dy);
  e.y = r2(e.y + s * dx + (c - 1) * dy);
}

/** Bakes the element's stretch and rotation into its nodes, leaving rot unset and vw = w. */
export function normalize(e: El) {
  let subs = worldPaths(e);
  if (e.rot) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, a = (e.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    subs = mapPaths(subs, (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
    delete e.rot;
  }
  setWorldPaths(e, subs);
}

/** The closest point on the curves to (px, py): which subpath and segment, the parameter, and the distance. */
export function nearest(subs: SubPath[], px: number, py: number): { si: number; i: number; t: number; x: number; y: number; d: number } | null {
  let best: { si: number; i: number; t: number; x: number; y: number; d: number } | null = null;
  subs.forEach((sp, si) => {
    for (let i = 0; i < segCount(sp); i++) {
      const s = segment(sp, i), N = 40;
      let bt = 0, bd = Infinity;
      for (let k = 0; k <= N; k++) { const p = cubicAt(s, k / N), d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; bt = k / N; } }
      // Refine around the best sample.
      let lo = Math.max(0, bt - 1 / N), hi = Math.min(1, bt + 1 / N);
      for (let k = 0; k < 20; k++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3, pa = cubicAt(s, a), pb = cubicAt(s, b);
        if (Math.hypot(pa.x - px, pa.y - py) < Math.hypot(pb.x - px, pb.y - py)) hi = b; else lo = a;
      }
      const t = (lo + hi) / 2, p = cubicAt(s, t), d = Math.hypot(p.x - px, p.y - py);
      if (!best || d < best.d) best = { si, i, t, x: p.x, y: p.y, d };
    }
  });
  return best;
}

/** Splits segment i of subpath si at t, keeping the curve's shape. Returns the new node's index. */
export function splitSegment(subs: SubPath[], si: number, i: number, t: number): number {
  const sp = subs[si], n = sp.nodes.length, a = sp.nodes[i], b = sp.nodes[(i + 1) % n], [p0, p1, p2, p3] = segment(sp, i);
  const lerp = (u: Pt, v: Pt) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
  const q0 = lerp(p0, p1), q1 = lerp(p1, p2), q2 = lerp(p2, p3), r0 = lerp(q0, q1), r1 = lerp(q1, q2), m = lerp(r0, r1);
  const curved = !isLine([p0, p1, p2, p3]), at = curved ? m : lerp(p0, p3);
  const node: VNode = { x: r2(at.x), y: r2(at.y) };
  if (curved) {
    if (a.ox != null) { a.ox = r2(q0.x); a.oy = r2(q0.y); }
    if (b.ix != null) { b.ix = r2(q2.x); b.iy = r2(q2.y); }
    Object.assign(node, { ix: r2(r0.x), iy: r2(r0.y), ox: r2(r1.x), oy: r2(r1.y), s: true });
  }
  sp.nodes.splice(i + 1, 0, node);
  return i + 1;
}

/** Removes nodes given as [subpath, index] pairs. Subpaths left with fewer than two nodes are dropped. */
export function removeNodes(subs: SubPath[], which: [number, number][]): SubPath[] {
  const gone = new Set(which.map(([si, i]) => si + ':' + i));
  return subs.map((sp, si) => ({ ...sp, nodes: sp.nodes.filter((_, i) => !gone.has(si + ':' + i)) })).filter(sp => sp.nodes.length >= 2);
}

/** Moves a node and its handles together. */
export function moveNode(n: VNode, dx: number, dy: number) {
  n.x = r2(n.x + dx); n.y = r2(n.y + dy);
  if (n.ix != null) { n.ix = r2(n.ix + dx); n.iy = r2(n.iy! + dy); }
  if (n.ox != null) { n.ox = r2(n.ox + dx); n.oy = r2(n.oy! + dy); }
}

/**
 * Drags one handle of a node. On a smooth node the other handle turns to stay in line, keeping its own
 * length, unless `free` is set (Alt), which makes the node a corner.
 */
export function dragHandle(n: VNode, which: 'i' | 'o', x: number, y: number, free = false) {
  if (which === 'i') { n.ix = r2(x); n.iy = r2(y); } else { n.ox = r2(x); n.oy = r2(y); }
  if (free) { delete n.s; return; }
  if (!n.s) return;
  const other = which === 'i' ? 'o' : 'i', ox = n[(other + 'x') as 'ix' | 'ox'], oy = n[(other + 'y') as 'iy' | 'oy'];
  const len = ox != null && oy != null ? Math.hypot(ox - n.x, oy - n.y) : Math.hypot(x - n.x, y - n.y);
  const dl = Math.hypot(x - n.x, y - n.y) || 1, ux = (n.x - x) / dl, uy = (n.y - y) / dl;
  if (other === 'i') { n.ix = r2(n.x + ux * len); n.iy = r2(n.y + uy * len); } else { n.ox = r2(n.x + ux * len); n.oy = r2(n.y + uy * len); }
}

/** Turns a node smooth (handles along its neighbors' direction) or into a sharp corner (no handles). */
export function setSmooth(sp: SubPath, i: number, smooth: boolean) {
  const n = sp.nodes[i], len = sp.nodes.length;
  if (!smooth) { delete n.ix; delete n.iy; delete n.ox; delete n.oy; delete n.s; return; }
  const prev = sp.nodes[i - 1] || (sp.closed ? sp.nodes[len - 1] : null), next = sp.nodes[i + 1] || (sp.closed ? sp.nodes[0] : null);
  const a = prev || n, b = next || n, dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
  const li = prev ? Math.hypot(n.x - prev.x, n.y - prev.y) / 3 : 0, lo = next ? Math.hypot(next.x - n.x, next.y - n.y) / 3 : 0;
  if (prev) { n.ix = r2(n.x - ux * li); n.iy = r2(n.y - uy * li); }
  if (next) { n.ox = r2(n.x + ux * lo); n.oy = r2(n.y + uy * lo); }
  n.s = true;
}

const K = 0.5523; // Circle approximation constant for cubic Beziers.

export function rectPath(w: number, h: number, rx = 0): SubPath[] {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (!r) return [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }];
  const k = r * (1 - K);
  return [{ closed: true, nodes: [
    { x: r, y: 0, ix: k, iy: 0 }, { x: w - r, y: 0, ox: w - k, oy: 0 },
    { x: w, y: r, ix: w, iy: k }, { x: w, y: h - r, ox: w, oy: h - k },
    { x: w - r, y: h, ix: w - k, iy: h }, { x: r, y: h, ox: k, oy: h },
    { x: 0, y: h - r, ix: 0, iy: h - k }, { x: 0, y: r, ox: 0, oy: k }] }];
}

export function ellipsePath(w: number, h: number): SubPath[] {
  const rx = w / 2, ry = h / 2, kx = rx * K, ky = ry * K;
  return [{ closed: true, nodes: [
    { x: rx, y: 0, ix: rx - kx, iy: 0, ox: rx + kx, oy: 0, s: true },
    { x: w, y: ry, ix: w, iy: ry - ky, ox: w, oy: ry + ky, s: true },
    { x: rx, y: h, ix: rx + kx, iy: h, ox: rx - kx, oy: h, s: true },
    { x: 0, y: ry, ix: 0, iy: ry + ky, ox: 0, oy: ry - ky, s: true }] }];
}

export function diamondPath(w: number, h: number): SubPath[] {
  return [{ closed: true, nodes: [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }] }];
}

/** Ramer-Douglas-Peucker: drops points that stay within `eps` of the simplified line. */
export function simplify(pts: number[][], eps: number): number[][] {
  if (pts.length < 3) return pts.slice();
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  let idx = 0, far = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i], d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
    if (d > far) { far = d; idx = i; }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** A smooth path through points (Catmull-Rom turned into Bezier handles). */
export function smoothThrough(pts: number[][], closed = false): SubPath {
  const n = pts.length, at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  return {
    closed: closed || undefined,
    nodes: pts.map((p, i) => {
      if (n < 3 || (!closed && (i === 0 || i === n - 1))) {
        const node: VNode = { x: r2(p[0]), y: r2(p[1]) };
        if (n >= 3 && i === 0) { const q = at(1); node.ox = r2(p[0] + (q[0] - p[0]) / 3); node.oy = r2(p[1] + (q[1] - p[1]) / 3); }
        if (n >= 3 && i === n - 1) { const q = at(n - 2); node.ix = r2(p[0] + (q[0] - p[0]) / 3); node.iy = r2(p[1] + (q[1] - p[1]) / 3); }
        return node;
      }
      const a = at(i - 1), b = at(i + 1), tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6;
      return { x: r2(p[0]), y: r2(p[1]), ix: r2(p[0] - tx), iy: r2(p[1] - ty), ox: r2(p[0] + tx), oy: r2(p[1] + ty), s: true };
    }),
  };
}

/** A subpath as a polygon, with curves cut into short straight pieces about `tol` long. */
export function flatten(sp: SubPath, tol = 2): number[][] {
  if (!sp.nodes.length) return [];
  const out: number[][] = [[sp.nodes[0].x, sp.nodes[0].y]];
  for (let i = 0; i < segCount(sp); i++) {
    const s = segment(sp, i);
    if (isLine(s)) { out.push([s[3].x, s[3].y]); continue; }
    const est = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) + Math.hypot(s[2].x - s[1].x, s[2].y - s[1].y) + Math.hypot(s[3].x - s[2].x, s[3].y - s[2].y);
    const k = Math.max(2, Math.min(200, Math.ceil(est / tol)));
    for (let j = 1; j <= k; j++) { const p = cubicAt(s, j / k); out.push([p.x, p.y]); }
  }
  if (sp.closed && out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop(); }
  return out;
}

/** Closed polygons (rings) back into subpaths of corner nodes, with near-straight runs merged. */
export function fromRings(rings: number[][][], eps = 0.05): SubPath[] {
  return rings.map(ring => {
    let pts = ring.slice();
    if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }
    pts = simplify([...pts, pts[0]], eps).slice(0, -1);
    return { closed: true as const, nodes: pts.map(([x, y]) => ({ x: r2(x), y: r2(y) })) };
  }).filter(sp => sp.nodes.length >= 3);
}

/**
 * Reads SVG path data with absolute M, L, H, V, Q, C, and Z commands (what VectorCraft's engine
 * writes) into subpaths. Quadratic curves become cubics; a closing point that repeats the start is
 * merged into the first node.
 */
export function fromD(d: string): SubPath[] {
  const tokens = d.match(/[MLHVQCZmlhvqcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  const subs: SubPath[] = [];
  let i = 0, cmd = '', cur: SubPath | null = null, x = 0, y = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (!cur) return;
    const ns = cur.nodes, a = ns[0], b = ns[ns.length - 1];
    if (cur.closed && ns.length > 1 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) {
      if (b.ix != null) { a.ix = b.ix; a.iy = b.iy; }
      ns.pop();
    }
    if (ns.length >= 2) subs.push(cur);
    cur = null;
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    const C = cmd.toUpperCase();
    if (C === 'Z') { if (cur) cur.closed = true; close(); cmd = ''; continue; }
    if (C === 'M') { close(); x = num(); y = num(); cur = { nodes: [{ x: r2(x), y: r2(y) }] }; cmd = 'L'; continue; }
    if (!cur) { cur = { nodes: [{ x: r2(x), y: r2(y) }] }; }
    const last = cur.nodes[cur.nodes.length - 1];
    if (C === 'L' || C === 'H' || C === 'V') {
      if (C === 'L') { x = num(); y = num(); } else if (C === 'H') x = num(); else y = num();
      cur.nodes.push({ x: r2(x), y: r2(y) });
    } else if (C === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(); x = num(); y = num();
      last.ox = r2(x1); last.oy = r2(y1); cur.nodes.push({ x: r2(x), y: r2(y), ix: r2(x2), iy: r2(y2) });
    } else if (C === 'Q') {
      const qx = num(), qy = num(), px = last.x, py = last.y; x = num(); y = num();
      last.ox = r2(px + (2 / 3) * (qx - px)); last.oy = r2(py + (2 / 3) * (qy - py));
      cur.nodes.push({ x: r2(x), y: r2(y), ix: r2(x + (2 / 3) * (qx - x)), iy: r2(y + (2 / 3) * (qy - y)) });
    } else { i++; }
  }
  close();
  // Drop zero-length steps: a repeated point merges into the node before it.
  for (const sp of subs) {
    const out: VNode[] = [];
    for (const n of sp.nodes) {
      const p = out[out.length - 1];
      if (p && Math.abs(p.x - n.x) < 1e-6 && Math.abs(p.y - n.y) < 1e-6 && (n.ix == null || (n.ix === n.x && n.iy === n.y))) {
        if (n.ox != null) { p.ox = n.ox; p.oy = n.oy; }
        continue;
      }
      out.push(n);
    }
    sp.nodes = out;
  }
  // Nodes whose handles line up are smooth, so editing them keeps the curve.
  for (const sp of subs) for (const n of sp.nodes) {
    if (n.ix == null || n.ox == null) continue;
    const a = Math.atan2(n.y - n.iy!, n.x - n.ix), b = Math.atan2(n.oy! - n.y, n.ox - n.x);
    let dd = Math.abs(a - b); if (dd > Math.PI) dd = 2 * Math.PI - dd;
    if (dd < 0.02) n.s = true;
  }
  return subs;
}
