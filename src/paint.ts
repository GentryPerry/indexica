/**
 * Paints for vector paths: solid colors and linear or radial gradients, stacked as several fills and
 * several strokes. A path without layers uses its plain fill, stroke, and stroke width.
 */
import { adjust } from './palette';
import type { El } from './types';

/**
 * A gradient across the shape's box. Linear gradients run along `angle`, or between `from` and `to`
 * once their handles are dragged on the canvas; radial gradients spread from `center` out to
 * `radius`. Points and the radius are fractions of the box (0 to 1).
 */
export interface Gradient {
  kind: 'linear' | 'radial'; angle: number; stops: [number, string][];
  from?: [number, number]; to?: [number, number]; center?: [number, number]; radius?: number;
}
/** A color ('' means the default ink), or a gradient. */
export type Paint = string | Gradient;
export interface StrokeLayer { paint: Paint; width: number }

export const isGrad = (p: Paint | undefined): p is Gradient => !!p && typeof p === 'object';

/** The fills a path draws, bottom first. */
export function fillLayers(e: El): Paint[] {
  if (e.fills) return e.fills;
  return e.fill && e.fill !== 'none' ? [e.fill] : [];
}

/** The strokes a path draws, bottom first. */
export function strokeLayers(e: El): StrokeLayer[] {
  if (e.strokes) return e.strokes;
  return e.stroke === 'none' ? [] : [{ paint: e.stroke || '', width: e.sw ?? 2 }];
}

/** Start and end points of a linear gradient across the shape's box, for an angle in degrees (0 runs left to right). */
export function linearEnds(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const a = (angle * Math.PI) / 180, c = Math.cos(a) / 2, s = Math.sin(a) / 2, r = (v: number) => Math.round(v * 1000) / 1000;
  return { x1: r(0.5 - c), y1: r(0.5 - s), x2: r(0.5 + c), y2: r(0.5 + s) };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Where a gradient sits in its box: the line of a linear one, or the circle of a radial one. */
export function gradientGeom(g: Gradient): { x1: number; y1: number; x2: number; y2: number } | { cx: number; cy: number; r: number } {
  if (g.kind === 'radial') { const [cx, cy] = g.center || [0.5, 0.5]; return { cx: r3(cx), cy: r3(cy), r: r3(g.radius ?? 0.5) }; }
  if (g.from && g.to) return { x1: r3(g.from[0]), y1: r3(g.from[1]), x2: r3(g.to[0]), y2: r3(g.to[1]) };
  return linearEnds(g.angle);
}
/** A gradient with one handle moved to a box point: `from`/`to` for linear, `center`/`edge` for radial. */
export function moveHandle(g: Gradient, which: 'from' | 'to' | 'center' | 'edge', x: number, y: number): Gradient {
  const geo = gradientGeom(g), p: [number, number] = [r3(x), r3(y)];
  if (g.kind === 'radial') {
    const c = 'cx' in geo ? [geo.cx, geo.cy] : [0.5, 0.5];
    return which === 'center' ? { ...g, center: p } : { ...g, radius: r3(Math.max(0.02, Math.hypot(x - c[0], y - c[1]))) };
  }
  const l = 'x1' in geo ? geo : linearEnds(g.angle);
  const from: [number, number] = which === 'from' ? p : [l.x1, l.y1], to: [number, number] = which === 'to' ? p : [l.x2, l.y2];
  const angle = Math.round((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI);
  return { ...g, from, to, angle };
}
/** The same gradient laid out by its angle again (what the angle control sets). */
export function byAngle(g: Gradient, angle: number): Gradient {
  const { from: _f, to: _t, ...rest } = g; void _f; void _t;
  return { ...rest, angle };
}

/** A gradient from a color to a lighter version of it. */
export function gradientFrom(color: string, kind: 'linear' | 'radial' = 'linear'): Gradient {
  const base = color && color !== 'none' ? color : '#2447d6';
  return { kind, angle: 90, stops: [[0, adjust(base, ([l, c, h]) => [Math.min(0.97, l + 0.18), c * 0.7, h])], [1, base]] };
}

/** The first color in a paint, for places that need a single color. */
export const colorOf = (p: Paint) => (isGrad(p) ? p.stops[0]?.[1] || '#000000' : p);

/** A CSS background that previews a paint in the panel. */
export function cssOf(p: Paint, ink = '#17202d'): string {
  if (!isGrad(p)) return p || ink;
  const stops = [...p.stops].sort((a, b) => a[0] - b[0]).map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(', ');
  return p.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${p.angle + 90}deg, ${stops})`;
}

/** Adds a stop halfway along the widest gap, colored halfway between its neighbors' first color. */
export function addStop(g: Gradient): Gradient {
  const st = [...g.stops].sort((a, b) => a[0] - b[0]);
  if (st.length < 2) return { ...g, stops: [...st, [1, st[0]?.[1] || '#ffffff']] };
  let at = 0;
  for (let i = 1; i < st.length; i++) if (st[i][0] - st[i - 1][0] > st[at + 1][0] - st[at][0]) at = i - 1;
  const o = Math.round(((st[at][0] + st[at + 1][0]) / 2) * 100) / 100;
  st.splice(at + 1, 0, [o, st[at][1]]);
  return { ...g, stops: st };
}

/** Removes a stop, keeping at least two. */
export function removeStop(g: Gradient, i: number): Gradient {
  return g.stops.length <= 2 ? g : { ...g, stops: g.stops.filter((_, j) => j !== i) };
}
