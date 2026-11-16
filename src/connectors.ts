import type { Box, El, Lookup } from './types';

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

/** Move point P toward Q until it sits `gap` outside P's own shape. */
function clipTo(P: Anchor, Q: Anchor, gap: number): Anchor {
  const t = P.el;
  if (!t) return P;
  const wx = Q.x - P.x, wy = Q.y - P.y;
  if (!wx && !wy) return P;
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

/** The two straight-line endpoints of a connector, clipped to the edges of what it attaches to. */
export function ends(c: El, get: Lookup, gap = 5): [Anchor, Anchor] {
  const [A, B] = anchors(c, get);
  return [clipTo(A, B, gap), clipTo(B, A, gap)];
}

function outer(t: El): Box {
  const r = (t.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const w = t.w * c + t.h * s, h = t.w * s + t.h * c;
  return { x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2, w, h };
}

/** Endpoints on the middle of the facing sides, for curved and right-angle lines. */
function sideEnds(c: El, get: Lookup, gap = 5): { p: Pt; q: Pt; horizontal: boolean } {
  const [A, B] = anchors(c, get);
  const horizontal = Math.abs(B.x - A.x) >= Math.abs(B.y - A.y);
  const side = (from: Anchor, to: Anchor): Pt => {
    if (!from.el) return { x: from.x, y: from.y };
    const b = outer(from.el);
    if (horizontal) return { x: to.x >= from.x ? b.x + b.w + gap : b.x - gap, y: from.y };
    return { x: from.x, y: to.y >= from.y ? b.y + b.h + gap : b.y - gap };
  };
  return { p: side(A, B), q: side(B, A), horizontal };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const n = (v: number) => Math.round(v * 100) / 100;

/** How far a cable of this length hangs below the straight line between its ends. */
export const cableSag = (dist: number) => clamp(dist * 0.22 + 16, 18, 170);

/**
 * Geometry for a connector in its line style. `sway` is the cable's momentary offset from rest
 * (see cable.ts); it only affects the cable style.
 */
export function connGeom(c: El, get: Lookup, sway: Pt = { x: 0, y: 0 }): ConnGeom {
  const style = c.style || 'straight';
  if (style === 'curve') {
    const { p, q, horizontal } = sideEnds(c, get);
    const dx = q.x - p.x, dy = q.y - p.y;
    const c1 = horizontal ? { x: p.x + dx / 2, y: p.y } : { x: p.x, y: p.y + dy / 2 };
    const c2 = horizontal ? { x: q.x - dx / 2, y: q.y } : { x: q.x, y: q.y - dy / 2 };
    const at = (t: number): Pt => {
      const u = 1 - t;
      return { x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x, y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y };
    };
    const flat = c2.x === q.x && c2.y === q.y;
    return {
      d: `M${n(p.x)} ${n(p.y)}C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(q.x)} ${n(q.y)}`,
      pts: [0, 0.25, 0.5, 0.75, 1].map(at), label: at(0.5), p, q,
      a0: Math.atan2(c1.y - p.y, c1.x - p.x), a1: flat ? Math.atan2(q.y - p.y, q.x - p.x) : Math.atan2(q.y - c2.y, q.x - c2.x),
    };
  }
  if (style === 'elbow') {
    const { p, q, horizontal } = sideEnds(c, get);
    const mid = horizontal ? (p.x + q.x) / 2 : (p.y + q.y) / 2;
    const pts: Pt[] = horizontal ? [p, { x: mid, y: p.y }, { x: mid, y: q.y }, q] : [p, { x: p.x, y: mid }, { x: q.x, y: mid }, q];
    const before = [...pts].reverse().find(t => t.x !== q.x || t.y !== q.y) || p;
    const after = pts.find(t => t.x !== p.x || t.y !== p.y) || q;
    return {
      d: 'M' + pts.map(t => `${n(t.x)} ${n(t.y)}`).join('L'), pts,
      label: { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }, p, q,
      a0: Math.atan2(after.y - p.y, after.x - p.x), a1: Math.atan2(q.y - before.y, q.x - before.x),
    };
  }
  if (style === 'cable') {
    const [p, q] = ends(c, get, 0);
    const sag = cableSag(Math.hypot(q.x - p.x, q.y - p.y));
    // A quadratic curve passes halfway to its control point, so the control sits at twice the hang.
    const ctrl = { x: (p.x + q.x) / 2 + 2 * sway.x, y: (p.y + q.y) / 2 + 2 * (sag + sway.y) };
    const at = (t: number): Pt => {
      const u = 1 - t;
      return { x: u * u * p.x + 2 * u * t * ctrl.x + t * t * q.x, y: u * u * p.y + 2 * u * t * ctrl.y + t * t * q.y };
    };
    return {
      d: `M${n(p.x)} ${n(p.y)}Q${n(ctrl.x)} ${n(ctrl.y)} ${n(q.x)} ${n(q.y)}`,
      pts: [0, 0.25, 0.5, 0.75, 1].map(at), label: at(0.5), p, q,
      a0: Math.atan2(ctrl.y - p.y, ctrl.x - p.x), a1: Math.atan2(q.y - ctrl.y, q.x - ctrl.x),
    };
  }
  const [p, q] = ends(c, get);
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  return { d: `M${n(p.x)} ${n(p.y)}L${n(q.x)} ${n(q.y)}`, pts: [p, q], label: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, p, q, a0: a, a1: a };
}
