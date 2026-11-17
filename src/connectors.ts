import type { Box, El, Lookup, Side } from './types';

export interface Pt { x: number; y: number }
interface Anchor extends Pt { el?: El }

/** Everything needed to draw a connector. Angles are in radians. */
export interface ConnGeom {
  d: string;
  /** Points along the line, for bounds and hit boxes. */
  pts: Pt[];
  label: Pt;
  p: Pt;
  q: Pt;
  /** Direction the line leaves p, and the direction it arrives at q. */
  a0: number;
  a1: number;
}

export const SIDES: Side[] = ['n', 'e', 's', 'w'];
export const OPPOSITE: Record<Side, Side> = { n: 's', e: 'w', s: 'n', w: 'e' };
const LOCAL: Record<Side, Pt> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const n2 = (v: number) => Math.round(v * 100) / 100;
function turn(v: Pt, deg = 0): Pt {
  if (!deg) return v;
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Outward direction of a side, after the piece's rotation. */
export const sideDir = (t: El, side: Side): Pt => turn(LOCAL[side], t.rot);

/** Middle of a side, `gap` outside the piece, after the piece's rotation. */
export function sidePoint(t: El, side: Side, gap = 0): Pt {
  const d = LOCAL[side], off = turn({ x: d.x * (t.w / 2 + gap), y: d.y * (t.h / 2 + gap) }, t.rot);
  return { x: t.x + t.w / 2 + off.x, y: t.y + t.h / 2 + off.y };
}

function outer(t: El): Box {
  const r = (t.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const w = t.w * c + t.h * s, h = t.w * s + t.h * c;
  return { x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2, w, h };
}

/**
 * The piece a connector end should attach to at a board point: the smallest piece whose box,
 * grown by `pad`, holds the point. Frames only win when no other piece does.
 */
export function pickTarget(els: El[], x: number, y: number, pad: number, exclude?: string | null): string | null {
  let best: El | null = null, bestScore = Infinity;
  for (const e of els) {
    if (e.type === 'conn' || e.id === exclude) continue;
    const b = outer(e);
    if (x < b.x - pad || x > b.x + b.w + pad || y < b.y - pad || y > b.y + b.h + pad) continue;
    const score = (e.type === 'frame' ? 1e12 : 0) + b.w * b.h;
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best ? best.id : null;
}

/** The side of `t` whose middle is within `max` of the point, if any. */
export function nearSide(t: El, x: number, y: number, max: number): Side | null {
  let best: Side | null = null, bd = max;
  for (const s of SIDES) {
    const p = sidePoint(t, s), d = Math.hypot(p.x - x, p.y - y);
    if (d <= bd) { best = s; bd = d; }
  }
  return best;
}

/** Move point P toward Q until it sits `gap` outside P's own shape. */
function clipTo(P: Anchor, Q: Pt, gap: number): Pt {
  const t = P.el;
  if (!t) return { x: P.x, y: P.y };
  const wx = Q.x - P.x, wy = Q.y - P.y;
  if (!wx && !wy) return { x: P.x, y: P.y };
  // Work in the shape's own unrotated frame; the scale factor k is the same in both frames.
  const r = -(t.rot || 0) * Math.PI / 180;
  const dx = wx * Math.cos(r) - wy * Math.sin(r), dy = wx * Math.sin(r) + wy * Math.cos(r);
  const rx = t.w / 2 + gap, ry = t.h / 2 + gap;
  let k: number;
  if (t.type === 'ellipse') k = 1 / Math.hypot(dx / rx, dy / ry);
  else if (t.type === 'diamond') k = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else k = Math.min(dx ? rx / Math.abs(dx) : 1e9, dy ? ry / Math.abs(dy) : 1e9);
  k = Math.min(k, 1);
  return { x: P.x + wx * k, y: P.y + wy * k };
}

function anchors(c: El, get: Lookup): [Anchor, Anchor] {
  const anchor = (id: string | null | undefined, x = 0, y = 0): Anchor => {
    const t = id ? get(id) : undefined;
    return t ? { x: t.x + t.w / 2, y: t.y + t.h / 2, el: t } : { x, y };
  };
  return [anchor(c.a, c.ax, c.ay), anchor(c.b, c.bx, c.by)];
}

/** The two straight-line endpoints of a connector, clipped to the edges of what it attaches to (or pinned to a side). */
export function ends(c: El, get: Lookup, gap = 5): [Pt, Pt] {
  const [A, B] = anchors(c, get);
  const pa = c.as && A.el ? sidePoint(A.el, c.as, gap) : null, pb = c.bs && B.el ? sidePoint(B.el, c.bs, gap) : null;
  return [pa || clipTo(A, pb || B, gap), pb || clipTo(B, pa || A, gap)];
}

/** Which way a line should leave box A toward box B: across the larger gap between them. */
function wantDir(A: Box, B: Box): Pt {
  const hgap = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w)), vgap = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
  if (hgap >= vgap) return { x: B.x + B.w / 2 >= A.x + A.w / 2 ? 1 : -1, y: 0 };
  return { x: 0, y: B.y + B.h / 2 >= A.y + A.h / 2 ? 1 : -1 };
}

/** The side of `t` that faces closest to a direction. */
function facing(t: El, want: Pt): Side {
  let best: Side = 'e', score = -Infinity;
  for (const s of SIDES) { const d = sideDir(t, s), v = d.x * want.x + d.y * want.y; if (v > score + 1e-9) { score = v; best = s; } }
  return best;
}

interface End { p: Pt; d: Pt }
/** Endpoints on the sides of the pieces, with the direction each end leaves its piece. */
function sideEnds(c: El, get: Lookup, gap: number, square: boolean): [End, End] {
  const ta = c.a ? get(c.a) : undefined, tb = c.b ? get(c.b) : undefined;
  const fa = { x: c.ax ?? 0, y: c.ay ?? 0 }, fb = { x: c.bx ?? 0, y: c.by ?? 0 };
  const boxA = ta ? outer(ta) : { ...fa, w: 0, h: 0 }, boxB = tb ? outer(tb) : { ...fb, w: 0, h: 0 };
  const end = (t: El | undefined, fixed: Side | undefined, own: Box, other: Box, free: Pt): End => {
    if (t) { const s = fixed || facing(t, wantDir(own, other)); return { p: sidePoint(t, s, gap), d: sideDir(t, s) }; }
    const ox = other.x + other.w / 2 - free.x, oy = other.y + other.h / 2 - free.y, len = Math.hypot(ox, oy) || 1;
    const d = square ? (Math.abs(ox) >= Math.abs(oy) ? { x: Math.sign(ox) || 1, y: 0 } : { x: 0, y: Math.sign(oy) || 1 }) : { x: ox / len, y: oy / len };
    return { p: free, d };
  };
  return [end(ta, c.as, boxA, boxB, fa), end(tb, c.bs, boxB, boxA, fb)];
}

/** Drop repeated points and points in the middle of a straight run. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = last!;
      if (Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) < 0.01) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * A right-angle route from p (leaving in direction dp) to q (whose piece faces dq).
 * Each end first steps `stub` straight out of its piece, then the two stubs are joined with
 * horizontal and vertical runs that avoid doubling back where they can.
 */
export function orthoRoute(p: Pt, dp: Pt, q: Pt, dq: Pt, stub = 20): Pt[] {
  const P = { x: p.x + dp.x * stub, y: p.y + dp.y * stub }, Q = { x: q.x + dq.x * stub, y: q.y + dq.y * stub };
  const hp = Math.abs(dp.x) >= Math.abs(dp.y), hq = Math.abs(dq.x) >= Math.abs(dq.y);
  const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2;
  let mid: Pt[];
  if (hp && hq) mid = (Q.x - P.x) * Math.sign(dp.x) >= 0 ? [{ x: mx, y: P.y }, { x: mx, y: Q.y }] : [{ x: P.x, y: my }, { x: Q.x, y: my }];
  else if (!hp && !hq) mid = (Q.y - P.y) * Math.sign(dp.y) >= 0 ? [{ x: P.x, y: my }, { x: Q.x, y: my }] : [{ x: mx, y: P.y }, { x: mx, y: Q.y }];
  else if (hp) mid = (Q.x - P.x) * Math.sign(dp.x) >= 0 && (P.y - Q.y) * Math.sign(dq.y) >= 0 ? [{ x: Q.x, y: P.y }] : [{ x: P.x, y: Q.y }];
  else mid = (Q.y - P.y) * Math.sign(dp.y) >= 0 && (P.x - Q.x) * Math.sign(dq.x) >= 0 ? [{ x: P.x, y: Q.y }] : [{ x: Q.x, y: P.y }];
  return simplify([p, P, ...mid, Q, q]);
}

/** SVG path through points with rounded corners. */
function roundedPath(pts: Pt[], r: number): string {
  let d = `M${n2(pts[0].x)} ${n2(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const k = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const u = (s: Pt, t: Pt) => { const l = Math.hypot(t.x - s.x, t.y - s.y) || 1; return { x: (t.x - s.x) / l, y: (t.y - s.y) / l }; };
    const ia = u(b, a), ic = u(b, c);
    d += `L${n2(b.x + ia.x * k)} ${n2(b.y + ia.y * k)}Q${n2(b.x)} ${n2(b.y)} ${n2(b.x + ic.x * k)} ${n2(b.y + ic.y * k)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${n2(z.x)} ${n2(z.y)}`;
}

/** How far a cable of this length hangs below the straight line between its ends. */
export const cableSag = (dist: number) => clamp(dist * 0.22 + 16, 18, 170);

function cubicAt(p: Pt, c1: Pt, c2: Pt, q: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x, y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y };
}

/**
 * Geometry for a connector in its line style. `sway` is the cable's momentary offset from rest
 * (see cable.ts); it only affects the cable style.
 */
export function connGeom(c: El, get: Lookup, sway: Pt = { x: 0, y: 0 }): ConnGeom {
  const style = c.style || 'straight';
  if (style === 'curve' || style === 'cable') {
    const cable = style === 'cable', [A, B] = sideEnds(c, get, cable ? 0 : 5, false), p = A.p, q = B.p, dist = Math.hypot(q.x - p.x, q.y - p.y);
    // Cables leave their plugs straight, then droop. A cubic's middle moves 3/4 of any shift given to both
    // control points, so the hang and the swing are scaled by 4/3 to land exactly at the middle.
    const reach = cable ? clamp(dist * 0.25, 18, 80) : clamp(dist * 0.4, 30, 160);
    const drop = cable ? (cableSag(dist) + sway.y) * 4 / 3 : 0, side = cable ? sway.x * 4 / 3 : 0;
    const c1 = { x: p.x + A.d.x * reach + side, y: p.y + A.d.y * reach + drop };
    const c2 = { x: q.x + B.d.x * reach + side, y: q.y + B.d.y * reach + drop };
    return {
      d: `M${n2(p.x)} ${n2(p.y)}C${n2(c1.x)} ${n2(c1.y)} ${n2(c2.x)} ${n2(c2.y)} ${n2(q.x)} ${n2(q.y)}`,
      pts: Array.from({ length: 13 }, (_, i) => cubicAt(p, c1, c2, q, i / 12)), label: cubicAt(p, c1, c2, q, 0.5), p, q,
      a0: Math.atan2(c1.y - p.y, c1.x - p.x), a1: Math.atan2(q.y - c2.y, q.x - c2.x),
    };
  }
  if (style === 'elbow') {
    const [A, B] = sideEnds(c, get, 5, true), pts = orthoRoute(A.p, A.d, B.p, B.d);
    const i = Math.floor((pts.length - 2) / 2), a = pts[i], b = pts[i + 1], before = pts[pts.length - 2], after = pts[1];
    return {
      d: roundedPath(pts, 8), pts, label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, p: A.p, q: B.p,
      a0: Math.atan2(after.y - A.p.y, after.x - A.p.x), a1: Math.atan2(B.p.y - before.y, B.p.x - before.x),
    };
  }
  const [p, q] = ends(c, get);
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  return { d: `M${n2(p.x)} ${n2(p.y)}L${n2(q.x)} ${n2(q.y)}`, pts: [p, q], label: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, p, q, a0: a, a1: a };
}
