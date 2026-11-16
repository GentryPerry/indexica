import type { Box, El, Lookup } from './types';

export const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

type Measurer = (text: string, size: number, weight: number) => number;
let ctx: CanvasRenderingContext2D | null = null;
let measurer: Measurer = (text, size, weight) => {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(text).width;
};
/** Swap the text measurer (tests use a fixed-width one). */
export function setMeasurer(m: Measurer) { measurer = m; }
export const measure = (text: string, size: number, weight = 400) => measurer(text, size, weight);

/** Word-wrap text to a pixel width. Long words are split; blank lines are kept. */
export function wrap(text: string | undefined, maxW: number, size: number, weight = 400): string[] {
  const out: string[] = [];
  const fits = (t: string) => measurer(t, size, weight) <= maxW;
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

interface Anchor { x: number; y: number; el?: El }

/** Move point P toward Q until it sits just outside P's own shape. */
function clipTo(P: Anchor, Q: Anchor): Anchor {
  const t = P.el;
  if (!t) return P;
  const wx = Q.x - P.x, wy = Q.y - P.y;
  if (!wx && !wy) return P;
  // Work in the shape's own unrotated frame; the scale factor k is the same in both frames.
  const r = -(t.rot || 0) * Math.PI / 180;
  const dx = wx * Math.cos(r) - wy * Math.sin(r), dy = wx * Math.sin(r) + wy * Math.cos(r);
  const rx = t.w / 2 + 5, ry = t.h / 2 + 5;
  let k: number;
  if (t.type === 'ellipse') k = 1 / Math.hypot(dx / rx, dy / ry);
  else if (t.type === 'diamond') k = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else k = Math.min(dx ? rx / Math.abs(dx) : 1e9, dy ? ry / Math.abs(dy) : 1e9);
  k = Math.min(k, 1);
  return { x: P.x + wx * k, y: P.y + wy * k };
}

/** The two drawn endpoints of a connector, clipped to the edges of what it attaches to. */
export function ends(c: El, get: Lookup): [Anchor, Anchor] {
  const anchor = (id: string | null | undefined, x = 0, y = 0): Anchor => {
    const t = id ? get(id) : undefined;
    return t ? { x: t.x + t.w / 2, y: t.y + t.h / 2, el: t } : { x, y };
  };
  const A = anchor(c.a, c.ax, c.ay), B = anchor(c.b, c.bx, c.by);
  return [clipTo(A, B), clipTo(B, A)];
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
 */
export function resizeBox(o: Box & { rot?: number }, hd: string, dx: number, dy: number, min: number): Box {
  const r = (o.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
  let x0 = -o.w / 2, y0 = -o.h / 2, x1 = o.w / 2, y1 = o.h / 2;
  if (hd.includes('w')) x0 = Math.min(x0 + lx, x1 - min);
  if (hd.includes('e')) x1 = Math.max(x1 + lx, x0 + min);
  if (hd.includes('n')) y0 = Math.min(y0 + ly, y1 - min);
  if (hd.includes('s')) y1 = Math.max(y1 + ly, y0 + min);
  const w = x1 - x0, h = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const cx = o.x + o.w / 2 + mx * cos - my * sin, cy = o.y + o.h / 2 + mx * sin + my * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Angle in degrees for a rotate handle dragged to (px, py) around (cx, cy). Snaps to 45s when close, or 15s when `step` is set. */
export function handleAngle(cx: number, cy: number, px: number, py: number, step: boolean): number {
  let a = Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90;
  if (step) a = Math.round(a / 15) * 15;
  else { const near = Math.round(a / 45) * 45; a = Math.abs(a - near) <= 3 ? near : Math.round(a); }
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a === -180 ? 180 : a;
}

export function bbox(e: El, get: Lookup): Box {
  if (e.type !== 'conn') return e.rot ? rotatedBox(e, e.rot) : { x: e.x, y: e.y, w: e.w, h: e.h };
  const [p, q] = ends(e, get);
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x), h: Math.abs(p.y - q.y) };
}

export function bounds(list: El[], get: Lookup): Box | null {
  if (!list.length) return null;
  const bs = list.map(e => bbox(e, get));
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y };
}

/** Grow an element's height so its text is never clipped. */
export function fitText(e: El) {
  if (e.type === 'sticky') e.h = Math.max(e.h, Math.ceil(wrap(e.text, e.w - 24, 16).length * 20.8 + 24));
  else if (e.type === 'text') e.h = Math.max(30, Math.ceil(wrap(e.text, e.w - 4, 18).length * 23.4 + 8));
  else if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond') e.h = Math.max(e.h, Math.ceil(wrap(e.text, e.w - 24, 15).length * 19.5 + 20));
}
