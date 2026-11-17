import type { Box } from './types';

/** A smart-guide line: vertical when axis is 'x' (at x = pos), horizontal when 'y'. */
export interface Guide { axis: 'x' | 'y'; pos: number; from: number; to: number }

const stops = (b: Box, axis: 'x' | 'y') => axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];
const span = (b: Box, axis: 'x' | 'y'): [number, number] => axis === 'x' ? [b.y, b.y + b.h] : [b.x, b.x + b.w];

function snapAxis(moving: Box, others: Box[], axis: 'x' | 'y', thr: number): { d: number; guides: Guide[] } {
  let best = Infinity;
  for (const o of others) for (const t of stops(o, axis)) for (const m of stops(moving, axis)) {
    const d = t - m;
    if (Math.abs(d) <= thr && Math.abs(d) < Math.abs(best)) best = d;
  }
  if (!Number.isFinite(best)) return { d: 0, guides: [] };
  const moved: Box = axis === 'x' ? { ...moving, x: moving.x + best } : { ...moving, y: moving.y + best };
  const byPos = new Map<number, Guide>();
  const [m0, m1] = span(moved, axis);
  for (const o of others) for (const t of stops(o, axis)) {
    if (!stops(moved, axis).some(m => Math.abs(m - t) < 0.01)) continue;
    const [o0, o1] = span(o, axis), g = byPos.get(t);
    if (g) { g.from = Math.min(g.from, o0); g.to = Math.max(g.to, o1); }
    else byPos.set(t, { axis, pos: t, from: Math.min(m0, o0), to: Math.max(m1, o1) });
  }
  return { d: best, guides: [...byPos.values()] };
}

/** A spacing marker: a measured gap along `axis` from `from` to `to`, drawn across at `at`. */
export interface Gap { axis: 'x' | 'y'; from: number; to: number; at: number }

interface Span { a0: number; a1: number; b0: number; b1: number }
const along = (b: Box, axis: 'x' | 'y'): Span => axis === 'x' ? { a0: b.x, a1: b.x + b.w, b0: b.y, b1: b.y + b.h } : { a0: b.y, a1: b.y + b.h, b0: b.x, b1: b.x + b.w };

/**
 * Equal spacing along one axis: center the moving box between its nearest neighbors in the same row,
 * or repeat the gap a neighbor already has to the next piece over.
 */
function spacingAxis(moving: Box, others: Box[], axis: 'x' | 'y', thr: number): { d: number; gaps: Gap[] } {
  const m = along(moving, axis), size = m.a1 - m.a0;
  const row = (s: Span) => others.map(o => along(o, axis)).filter(o => o.b0 < s.b1 && o.b1 > s.b0);
  const near = row(m);
  const lefts = near.filter(o => o.a1 <= m.a0 + thr), rights = near.filter(o => o.a0 >= m.a1 - thr);
  const L = lefts.sort((p, q) => q.a1 - p.a1)[0], R = rights.sort((p, q) => p.a0 - q.a0)[0];
  const mid = (p: Span, q: Span) => (Math.max(p.b0, q.b0) + Math.min(p.b1, q.b1)) / 2;
  const cands: { pos: number; gaps: Gap[] }[] = [];
  if (L && R && R.a0 - L.a1 > size) {
    const pos = (L.a1 + R.a0 - size) / 2, at = mid(L, m);
    cands.push({ pos, gaps: [{ axis, from: L.a1, to: pos, at }, { axis, from: pos + size, to: R.a0, at: mid(R, m) }] });
  }
  if (L) {
    const LL = row(L).filter(o => o.a1 <= L.a0).sort((p, q) => q.a1 - p.a1)[0];
    if (LL && L.a0 - LL.a1 > 0) { const g = L.a0 - LL.a1, pos = L.a1 + g; cands.push({ pos, gaps: [{ axis, from: LL.a1, to: L.a0, at: mid(LL, L) }, { axis, from: L.a1, to: pos, at: mid(L, m) }] }); }
  }
  if (R) {
    const RR = row(R).filter(o => o.a0 >= R.a1).sort((p, q) => p.a0 - q.a0)[0];
    if (RR && RR.a0 - R.a1 > 0) { const g = RR.a0 - R.a1, pos = R.a0 - g - size; cands.push({ pos, gaps: [{ axis, from: pos + size, to: R.a0, at: mid(R, m) }, { axis, from: R.a1, to: RR.a0, at: mid(R, RR) }] }); }
  }
  const best = cands.filter(c => Math.abs(c.pos - m.a0) <= thr).sort((p, q) => Math.abs(p.pos - m.a0) - Math.abs(q.pos - m.a0))[0];
  return best ? { d: best.pos - m.a0, gaps: best.gaps } : { d: 0, gaps: [] };
}

/**
 * Nudge a moving box so its edges or center line up with nearby boxes. Where no edge lines up on an
 * axis, it tries equal spacing instead.
 */
export function snapMove(moving: Box, others: Box[], thr: number): { dx: number; dy: number; guides: Guide[]; gaps: Gap[] } {
  let x: { d: number; guides: Guide[]; gaps?: Gap[] } = snapAxis(moving, others, 'x', thr), y: { d: number; guides: Guide[]; gaps?: Gap[] } = snapAxis(moving, others, 'y', thr);
  if (!x.guides.length) { const s = spacingAxis(moving, others, 'x', thr); x = { d: s.d, guides: [], gaps: s.gaps }; }
  if (!y.guides.length) { const s = spacingAxis(moving, others, 'y', thr); y = { d: s.d, guides: [], gaps: s.gaps }; }
  return { dx: x.d, dy: y.d, guides: [...x.guides, ...y.guides], gaps: [...(x.gaps || []), ...(y.gaps || [])] };
}

/** Snap one coordinate (a dragged edge) to nearby boxes. `extent` is the edge's own span on the other axis. */
export function snapPoint(v: number, axis: 'x' | 'y', others: Box[], thr: number, extent: [number, number]): { v: number; guide: Guide } | null {
  let best: { v: number; guide: Guide } | null = null;
  for (const o of others) for (const t of stops(o, axis)) {
    if (Math.abs(t - v) > thr || (best && Math.abs(t - v) >= Math.abs(best.v - v))) continue;
    const [o0, o1] = span(o, axis);
    best = { v: t, guide: { axis, pos: t, from: Math.min(extent[0], o0), to: Math.max(extent[1], o1) } };
  }
  return best;
}
