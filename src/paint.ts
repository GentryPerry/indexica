/**
 * Paints for vector paths: solid colors and linear or radial gradients, stacked as several fills and
 * several strokes. A path without layers uses its plain fill, stroke, and stroke width.
 */
import { adjust } from './palette';
import type { El } from './types';

export interface Gradient { kind: 'linear' | 'radial'; angle: number; stops: [number, string][] }
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
