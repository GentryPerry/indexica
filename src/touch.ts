/**
 * Touch gestures for the canvas: which fingers are down, two-finger pan and pinch zoom,
 * and the distances and times that tell a tap from a drag or a long press.
 */

export interface Cam { x: number; y: number; z: number }
export interface Pt { x: number; y: number }

/** Zoom limits, the same as the mouse wheel and the zoom menu. */
export const MIN_Z = 0.1;
export const MAX_Z = 4;
/** How far (screen px) a finger may drift and still count as a tap or a held press. */
export const TAP_SLOP = 10;
/** How long a still finger is held before it opens the context menu. */
export const LONG_PRESS_MS = 500;
/** Radius (screen px) of the invisible target added around small handles for fingers. */
export const TOUCH_HIT = 14;

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** True once a finger has travelled past the tap slop. */
export function movedPast(a: Pt, b: Pt, slop = TAP_SLOP): boolean {
  return dist(a, b) > slop;
}

/** The camera and finger positions when a pinch started. */
export interface Pinch { cam: Cam; a: Pt; b: Pt }

/**
 * The camera for a pinch in progress: the board point that was under the midpoint of the two
 * fingers stays under their midpoint, and the zoom follows the change in their spread.
 * Points are in canvas screen coordinates.
 */
export function pinchCam(p: Pinch, a: Pt, b: Pt, minZ = MIN_Z, maxZ = MAX_Z): Cam {
  const d0 = Math.max(1, dist(p.a, p.b));
  const z = Math.min(maxZ, Math.max(minZ, p.cam.z * dist(a, b) / d0));
  const m0 = mid(p.a, p.b), m1 = mid(a, b);
  const wx = (m0.x - p.cam.x) / p.cam.z, wy = (m0.y - p.cam.y) / p.cam.z;
  return { x: m1.x - wx * z, y: m1.y - wy * z, z };
}

/** The fingers currently on the canvas, in the order they went down. */
export class Touches {
  private pts = new Map<number, Pt>();
  get count(): number { return this.pts.size; }
  down(id: number, p: Pt): void { this.pts.set(id, { ...p }); }
  move(id: number, p: Pt): boolean {
    if (!this.pts.has(id)) return false;
    this.pts.set(id, { ...p });
    return true;
  }
  up(id: number): void { this.pts.delete(id); }
  has(id: number): boolean { return this.pts.has(id); }
  clear(): void { this.pts.clear(); }
  /** The first two fingers, or null with fewer than two down. */
  pair(): [Pt, Pt] | null {
    const v = [...this.pts.values()];
    return v.length >= 2 ? [v[0], v[1]] : null;
  }
}
