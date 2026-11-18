/**
 * The eraser on vectors, as in Illustrator: filled closed shapes lose the area the eraser swept
 * (a subtract with the swept band), and open strokes are cut where it passed, leaving the pieces
 * on either side. Works in the path's own unrotated frame; the caller converts the eraser trail.
 */
import * as X from './exact';
import { combine as polyCombine, regionOf, strokeRegion, subsOfRegion } from './boolean';
import { flatten, simplify, smoothThrough, type SubPath } from './vector';

type Pt = [number, number];

const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const nearTrail = (p: Pt, trail: Pt[], r: number) => {
  if (trail.length === 1) return Math.hypot(p[0] - trail[0][0], p[1] - trail[0][1]) <= r;
  for (let i = 1; i < trail.length; i++) if (distToSeg(p, trail[i - 1], trail[i]) <= r) return true;
  return false;
};

/** Points along a subpath no farther apart than `step`, so straight edges are tested along their length. */
function dense(sp: SubPath, step: number): Pt[] {
  const pts = flatten(sp, 0.5) as Pt[], out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; out.push(a);
    const b = pts[i + 1] || (sp.closed ? pts[0] : null); if (!b) break;
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** The band the eraser swept, as closed outlines. */
function band(trail: Pt[], r: number): SubPath[] {
  const line: SubPath[] = [{ nodes: (trail.length === 1 ? [trail[0], [trail[0][0] + 0.01, trail[0][1]] as Pt] : trail).map(([x, y]) => ({ x, y })) }];
  return X.outlineStroke(line, r * 2, 'round', 'round') || subsOfRegion(strokeRegion(line, r * 2, 0.75));
}

/**
 * Erases along `trail` (radius `r`, plus half the stroke width `sw` for open strokes) from `subs`.
 * Returns the new subpaths, or null when the eraser missed them entirely.
 */
export function eraseSubs(subs: SubPath[], trail: Pt[], r: number, sw = 0): SubPath[] | null {
  if (!trail.length || !subs.length) return null;
  const closed = subs.filter(sp => sp.closed), open = subs.filter(sp => !sp.closed);
  let touched = false;
  const out: SubPath[] = [];
  if (closed.length) {
    const step = Math.max(0.5, r / 2);
    const hit = closed.some(sp => dense(sp, step).some(p => nearTrail(p, trail, r))) ||
      trail.some(p => closed.some(sp => inside(p, flatten({ ...sp, closed: true }, 1) as Pt[])));
    if (hit) {
      touched = true;
      const cut = band(trail, r);
      const res = X.combine('subtract', [{ subs: closed, evenodd: true }, { subs: cut }]);
      out.push(...(res ?? (() => { try { return subsOfRegion(polyCombine('subtract', [regionOf(closed), regionOf(cut)])); } catch { return closed; } })()));
    } else out.push(...closed);
  }
  for (const sp of open) {
    const pts = dense(sp, Math.max(0.5, r / 3));
    const keep = pts.map(p => !nearTrail(p, trail, r + sw / 2));
    if (keep.every(Boolean)) { out.push(sp); continue; }
    touched = true;
    let run: Pt[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const simple = simplify(run as number[][], 0.6) as number[][];
        out.push(simple.length >= 3 ? smoothThrough(simple) : { nodes: simple.map(([x, y]) => ({ x, y })) });
      }
      run = [];
    };
    pts.forEach((p, i) => { if (keep[i]) run.push(p); else flush(); });
    flush();
  }
  return touched ? out : null;
}

function inside(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
