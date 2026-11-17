/**
 * Freehand brushes and the stroke eraser. Brush and pencil strokes are drawn as filled outlines whose
 * width follows pen pressure (or drawing speed with a mouse), built with perfect-freehand. Points are
 * [x, y] or [x, y, pressure], relative to the drawing's top-left like other drawings.
 */
import { getStroke } from 'perfect-freehand';

export type Brush = 'pen' | 'brush' | 'pencil' | 'marker';
export const BRUSHES: Record<Brush, { label: string; width: number; widths: [number, string][] }> = {
  pen: { label: 'Pen', width: 2.5, widths: [[2, 'Thin'], [4, 'Medium'], [8, 'Thick']] },
  brush: { label: 'Brush', width: 10, widths: [[6, 'Thin'], [10, 'Medium'], [18, 'Thick']] },
  pencil: { label: 'Pencil', width: 2, widths: [[1.5, 'Thin'], [2.5, 'Medium'], [4, 'Thick']] },
  marker: { label: 'Marker', width: 7, widths: [[5, 'Thin'], [7, 'Medium'], [12, 'Thick']] },
};

/** True for brushes drawn as filled, pressure-shaped outlines rather than plain strokes. */
export const shaped = (b?: string) => b === 'brush' || b === 'pencil';

const hasPressure = (pts: number[][]) => pts.some(p => p.length > 2 && p[2] > 0 && p[2] !== 0.5);

/** The outline of a brush or pencil stroke, as a polygon. `last` is false while the stroke is still being drawn. */
export function brushOutline(pts: number[][], size: number, kind: Brush, last = true): number[][] {
  if (!pts.length) return [];
  const brush = kind === 'brush';
  return getStroke(pts.map(p => [p[0], p[1], p[2] ?? 0.5]), {
    size, last,
    thinning: brush ? 0.68 : 0.3,
    smoothing: 0.62,
    streamline: brush ? 0.5 : 0.35,
    simulatePressure: !hasPressure(pts),
    start: { taper: brush ? size * 2.5 : 0, cap: true },
    end: { taper: brush ? size * 3.5 : 0, cap: true },
  });
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** SVG path data for an outline polygon, smoothed through midpoints and offset by (ox, oy). */
export function outlineD(poly: number[][], ox = 0, oy = 0): string {
  const n = poly.length;
  if (n < 3) return '';
  const p = (i: number) => poly[i % n], f = (x: number, y: number) => `${r2(x + ox)} ${r2(y + oy)}`;
  let d = `M${f((p(0)[0] + p(1)[0]) / 2, (p(0)[1] + p(1)[1]) / 2)}`;
  for (let i = 1; i <= n; i++) d += `Q${f(p(i)[0], p(i)[1])} ${f((p(i)[0] + p(i + 1)[0]) / 2, (p(i)[1] + p(i + 1)[1]) / 2)}`;
  return d + 'Z';
}

/**
 * Cuts a stroke where an eraser of radius `r` touches it at (ex, ey). Returns the runs of points that
 * survive; a run needs at least two points. Segments that pass through the eraser are cut too.
 */
export function eraseStroke(pts: number[][], ex: number, ey: number, r: number): number[][][] {
  const inside = (p: number[]) => Math.hypot(p[0] - ex, p[1] - ey) <= r;
  const segHits = (a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((ex - a[0]) * dx + (ey - a[1]) * dy) / l2)) : 0;
    return Math.hypot(a[0] + t * dx - ex, a[1] + t * dy - ey) <= r;
  };
  const runs: number[][][] = [];
  let cur: number[][] = [];
  pts.forEach((p, i) => {
    if (inside(p) || (i > 0 && !inside(pts[i - 1]) && segHits(pts[i - 1], p) && cur.length)) {
      if (!inside(p)) { if (cur.length >= 2) runs.push(cur); cur = [p]; return; }
      if (cur.length >= 2) runs.push(cur);
      cur = [];
      return;
    }
    cur.push(p);
  });
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/** Whether the eraser touches a stroke at all. */
export function touches(pts: number[][], ex: number, ey: number, r: number): boolean {
  return eraseStroke(pts, ex, ey, r).reduce((a, run) => a + run.length, 0) !== pts.length;
}
