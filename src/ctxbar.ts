/**
 * The floating toolbar over a selection (FigJam's context toolbar): which controls a selection gets,
 * and the size steps. The bar itself is drawn in app.ts.
 */
import type { El } from './types';

/** Pieces whose fill the bar can set. Frames are included (their color, as FigJam sections have). */
export const CTX_FILL = ['sticky', 'rect', 'ellipse', 'diamond', 'frame'];
/** Pieces whose whole-text style (font, size, bold, color) the bar can set. */
export const CTX_TEXT = ['sticky', 'text', 'rect', 'ellipse', 'diamond'];
/** Text sizes the bar steps through. */
export const CTX_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 128];

export interface CtxKinds { fill: boolean; text: boolean; note: boolean; list: boolean }

/** The control groups for a selection, or null when the bar has nothing to offer (or anything is locked). */
export function ctxKinds(list: El[]): CtxKinds | null {
  if (!list.length || list.some(e => e.locked || e.boolIn || e.live)) return null;
  const every = (types: string[]) => list.every(e => types.includes(e.type));
  const k = { fill: every(CTX_FILL), text: every(CTX_TEXT), note: every(['sticky']), list: every(['sticky', 'text']) };
  return k.fill || k.text ? k : null;
}

/** The next size up or down from `cur` in `sizes`, staying put at either end. */
export function stepSize(cur: number, dir: 1 | -1, sizes: number[] = CTX_SIZES): number {
  if (dir > 0) return sizes.find(v => v > cur + 0.01) ?? cur;
  for (let i = sizes.length - 1; i >= 0; i--) if (sizes[i] < cur - 0.01) return sizes[i];
  return cur;
}

/** The value every piece shares for `key`, or undefined when they differ. */
export function shared<T>(list: El[], get: (e: El) => T): T | undefined {
  if (!list.length) return undefined;
  const v = get(list[0]);
  return list.every(e => get(e) === v) ? v : undefined;
}
