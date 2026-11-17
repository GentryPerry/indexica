import { connGeom } from './connectors';
import { FONTS, type Box, type El, type Lookup } from './types';

export { ends } from './connectors';

export const FONT = FONTS.sans.stack;

export interface TextStyle { size: number; weight: number; family: string; italic: boolean }

type Measurer = (text: string, size: number, weight: number, family: string, italic: boolean) => number;
let ctx: CanvasRenderingContext2D | null = null;
let measurer: Measurer = (text, size, weight, family, italic) => {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
};
/** Swap the text measurer (tests use a fixed-width one). */
export function setMeasurer(m: Measurer) { measurer = m; }
export const measure = (text: string, size: number, weight = 400, family = FONT, italic = false) => measurer(text, size, weight, family, italic);

const DEFAULTS: Partial<Record<El['type'], [size: number, weight: number]>> = {
  sticky: [16, 400], text: [18, 400], rect: [15, 400], ellipse: [15, 400], diamond: [15, 400], card: [14, 600], frame: [13, 600], conn: [13, 500],
};

/** The text style an element is drawn with: its own font choices on top of its type's defaults. */
export function textStyle(e: El): TextStyle {
  const [size, weight] = DEFAULTS[e.type] || [15, 400];
  return { size: e.size || size, weight: e.weight || weight, family: (FONTS[e.font || ''] || FONTS.sans).stack, italic: !!e.italic };
}

/** Word-wrap text to a pixel width. Long words are split; blank lines are kept. */
export function wrap(text: string | undefined, maxW: number, size: number, weight = 400, family = FONT, italic = false): string[] {
  const out: string[] = [];
  const fits = (t: string) => measurer(t, size, weight, family, italic) <= maxW;
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (let word of para.split(' ')) {
      while (!fits(word) && word.length > 1) {
        let i = word.length;
        while (i > 1 && !fits(word.slice(0, i))) i--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, i));
        word = word.slice(i);
      }
      const t = line ? line + ' ' + word : word;
      if (!fits(t) && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Wrap an element's own text in its own style. */
export function wrapEl(e: El, maxW: number): string[] {
  const st = textStyle(e);
  return wrap(e.text, maxW, st.size, st.weight, st.family, st.italic);
}

/** Axis-aligned box that contains `b` after rotating it `deg` degrees around its center. */
export function rotatedBox(b: Box, deg: number): Box {
  const r = deg * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const w = b.w * c + b.h * s, h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/**
 * Resize a (possibly rotated) box by dragging a handle. `hd` names the handle (n, s, e, w, or a corner);
 * dx/dy are the pointer movement in board coordinates. The opposite edge or corner stays fixed on screen.
 * With `ratio` (width / height), corner handles keep that shape.
 */
export function resizeBox(o: Box & { rot?: number }, hd: string, dx: number, dy: number, min: number, ratio?: number): Box {
  const r = (o.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
  let x0 = -o.w / 2, y0 = -o.h / 2, x1 = o.w / 2, y1 = o.h / 2;
  if (hd.includes('w')) x0 = Math.min(x0 + lx, x1 - min);
  if (hd.includes('e')) x1 = Math.max(x1 + lx, x0 + min);
  if (hd.includes('n')) y0 = Math.min(y0 + ly, y1 - min);
  if (hd.includes('s')) y1 = Math.max(y1 + ly, y0 + min);
  if (ratio && hd.length === 2) { const tall = (x1 - x0) / ratio; if (hd.includes('n')) y0 = y1 - tall; else y1 = y0 + tall; }
  const w = x1 - x0, h = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const cx = o.x + o.w / 2 + mx * cos - my * sin, cy = o.y + o.h / 2 + mx * sin + my * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Wrap an angle into the range (-180, 180]. */
export function normAngle(a: number): number {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a === -180 ? 180 : a;
}

/** Tidy a dragged angle: 15 degree steps when `step` is set, otherwise whole degrees that settle on 45s when within 3. */
export function snapAngle(a: number, step: boolean): number {
  if (step) a = Math.round(a / 15) * 15;
  else { const near = Math.round(a / 45) * 45; a = Math.abs(a - near) <= 3 ? near : Math.round(a); }
  return normAngle(a);
}

export function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - cx, dy = y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A copy of `o` turned `deg` degrees around the pivot (cx, cy): its center orbits the pivot and its own
 * rotation increases by the same amount. Connectors turn their free end points instead.
 */
export function rotateEl(o: El, cx: number, cy: number, deg: number): El {
  const e = { ...o };
  if (o.type === 'conn') {
    const p = rotatePoint(o.ax ?? 0, o.ay ?? 0, cx, cy, deg), q = rotatePoint(o.bx ?? 0, o.by ?? 0, cx, cy, deg);
    return Object.assign(e, { ax: round2(p.x), ay: round2(p.y), bx: round2(q.x), by: round2(q.y) });
  }
  const c = rotatePoint(o.x + o.w / 2, o.y + o.h / 2, cx, cy, deg);
  e.x = round2(c.x - o.w / 2);
  e.y = round2(c.y - o.h / 2);
  const rot = round2(normAngle((o.rot || 0) + deg));
  if (rot) e.rot = rot; else delete e.rot;
  return e;
}

/**
 * A copy of `o` scaled by `f` away from the fixed point (ox, oy). Sizes, drawings, free connector ends,
 * and the text size of notes, shapes, and text all scale together, so a resized group keeps its look.
 */
export function scaleEl(o: El, ox: number, oy: number, f: number): El {
  const e = { ...o }, sx = (v: number) => round2(ox + (v - ox) * f), sy = (v: number) => round2(oy + (v - oy) * f);
  if (o.type === 'conn') return Object.assign(e, { ax: sx(o.ax ?? 0), ay: sy(o.ay ?? 0), bx: sx(o.bx ?? 0), by: sy(o.by ?? 0) });
  e.w = round2(o.w * f);
  e.h = round2(o.h * f);
  e.x = round2(ox + (o.x + o.w / 2 - ox) * f - e.w / 2);
  e.y = round2(oy + (o.y + o.h / 2 - oy) * f - e.h / 2);
  if (o.pts) e.pts = o.pts.map(p => [Math.round(p[0] * f * 10) / 10, Math.round(p[1] * f * 10) / 10]);
  if (['sticky', 'text', 'rect', 'ellipse', 'diamond'].includes(o.type)) e.size = Math.min(400, Math.max(4, Math.round(textStyle(o).size * f * 10) / 10));
  return e;
}

export function bbox(e: El, get: Lookup): Box {
  if (e.type !== 'conn') return e.rot ? rotatedBox(e, e.rot) : { x: e.x, y: e.y, w: e.w, h: e.h };
  const pts = connGeom(e, get).pts;
  const x = Math.min(...pts.map(p => p.x)), y = Math.min(...pts.map(p => p.y));
  return { x, y, w: Math.max(...pts.map(p => p.x)) - x, h: Math.max(...pts.map(p => p.y)) - y };
}

export function bounds(list: El[], get: Lookup): Box | null {
  if (!list.length) return null;
  const bs = list.map(e => bbox(e, get));
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y };
}

/** Grow an element's height so its text is never clipped. */
export function fitText(e: El) {
  const lh = textStyle(e).size * 1.3;
  if (e.type === 'sticky') e.h = Math.max(e.h, Math.ceil(wrapEl(e, e.w - 24).length * lh + 24));
  else if (e.type === 'text') e.h = Math.ceil(wrapEl(e, e.w - 4).length * lh + 8);
  else if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond') e.h = Math.max(e.h, Math.ceil(wrapEl(e, e.w - 24).length * lh + 20));
}
