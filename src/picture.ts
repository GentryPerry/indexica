/**
 * Picture cropping. A picture piece shows a window of its image: `crop` is the share cut from each
 * side (left, top, right, bottom). The whole image therefore sits at a fixed place on the board while
 * the window moves over it, which is how cropping in PowerPoint and Figma feels. Pure functions.
 */
import type { Box, El } from './types';

export type Crop = [number, number, number, number];
export const cropOf = (e: El): Crop => e.crop || [0, 0, 0, 0];
const MIN = 0.02;

/** Where the whole (uncropped) image lies on the board. */
export function fullRect(e: El): Box {
  const [l, t, r, b] = cropOf(e), fw = Math.max(MIN, 1 - l - r), fh = Math.max(MIN, 1 - t - b);
  const w = e.w / fw, h = e.h / fh;
  return { x: e.x - l * w, y: e.y - t * h, w, h };
}

const tidy = (c: Crop): Crop | undefined => c.every(v => Math.abs(v) < 1e-4) ? undefined : c.map(v => Math.round(v * 1e4) / 1e4) as Crop;
function put(e: El, c: Crop) { const t = tidy(c); if (t) e.crop = t; else delete e.crop; }

/**
 * Moves the window to a new box over an image that stays at `full`. The window is kept inside the
 * image. The piece takes the window's box and the matching crop.
 */
export function setWindow(e: El, box: Box, full: Box) {
  const x0 = Math.max(full.x, Math.min(box.x, full.x + full.w * (1 - MIN))), y0 = Math.max(full.y, Math.min(box.y, full.y + full.h * (1 - MIN)));
  const x1 = Math.min(full.x + full.w, Math.max(box.x + box.w, x0 + full.w * MIN)), y1 = Math.min(full.y + full.h, Math.max(box.y + box.h, y0 + full.h * MIN));
  e.x = Math.round(x0); e.y = Math.round(y0); e.w = Math.max(1, Math.round(x1 - x0)); e.h = Math.max(1, Math.round(y1 - y0));
  put(e, [(x0 - full.x) / full.w, (y0 - full.y) / full.h, (full.x + full.w - x1) / full.w, (full.y + full.h - y1) / full.h]);
}

/** Slides the image under a window that stays put, by a board distance, never past its edges. */
export function panCrop(e: El, dx: number, dy: number, full: Box) {
  const [l, t, r, b] = cropOf(e);
  const cw = 1 - l - r, ch = 1 - t - b;
  const nl = Math.max(0, Math.min(1 - cw, l - dx / full.w)), nt = Math.max(0, Math.min(1 - ch, t - dy / full.h));
  put(e, [nl, nt, 1 - cw - nl, 1 - ch - nt]);
}

/**
 * Crops to an aspect ratio (width over height): the largest window of that shape inside the image,
 * centered on the current window. The image keeps its place and scale.
 */
export function cropTo(e: El, ratio: number) {
  const full = fullRect(e), cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  let w = full.w, h = w / ratio;
  if (h > full.h) { h = full.h; w = h * ratio; }
  const x = Math.max(full.x, Math.min(full.x + full.w - w, cx - w / 2)), y = Math.max(full.y, Math.min(full.y + full.h - h, cy - h / 2));
  setWindow(e, { x, y, w, h }, full);
}

/** Shows the whole image again at its current scale. */
export function resetCrop(e: El) {
  const full = fullRect(e);
  Object.assign(e, { x: Math.round(full.x), y: Math.round(full.y), w: Math.round(full.w), h: Math.round(full.h) });
  delete e.crop;
}

/**
 * Fills a box with the picture, cropping the overflow, as a picture placeholder does. `ratio` is the
 * image's own width over height.
 */
export function fillBox(e: El, box: Box, ratio: number) {
  const boxR = box.w / box.h;
  Object.assign(e, { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) });
  if (Math.abs(boxR - ratio) < 1e-3) { delete e.crop; return; }
  if (ratio > boxR) { const cut = (1 - boxR / ratio) / 2; put(e, [cut, 0, cut, 0]); }
  else { const cut = (1 - ratio / boxR) / 2; put(e, [0, cut, 0, cut]); }
}

/** SVG filter values for a picture's adjustments, or null when it has none. */
export function adjustments(e: El): { sat: number; slope: number; intercept: number } | null {
  const b = e.bright || 0, c = e.contrast || 0, s = e.sat || 0;
  if (!b && !c && !s && !e.gray) return null;
  // Contrast pivots on mid grey; brightness shifts everything.
  const slope = 1 + c, intercept = 0.5 * (1 - slope) + b * 0.5;
  return { sat: e.gray ? 0 : Math.max(0, 1 + s), slope, intercept };
}
