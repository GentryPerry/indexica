/**
 * The far view. Zoomed out, boards draw into one 2D canvas as simplified pieces (fills, outlines,
 * strokes, and grey bars standing in for text, as design tools do) instead of thousands of SVG nodes,
 * so panning and zooming a 20,000-piece board stays smooth. Near zoom keeps the full SVG drawing.
 *
 * Also a uniform grid index over piece bounds, for culling and for picking pieces under the pointer
 * when there are no SVG nodes to hit.
 */
import { connGeom } from './connectors';
import { presetDef, presetPaths } from './presetgeom';
import { outlineFor, paintFill, type Theme } from './palette';
import { pathD, worldPaths } from './vector';
import { STATUS, type Box, type El, type Lookup } from './types';

/** Below this zoom the board draws in the far view. */
export const LOD_ZOOM = 0.25;

export interface LodCam { x: number; y: number; z: number }
export interface LodColors { theme: Theme; ink: string; muted: string; frame: string; frameLine: string; line: string; card: string }
export interface LodCtx {
  get: Lookup;
  bbox: (e: El) => Box;
  /** A loaded picture for a source id, if any. */
  image?: (src: string) => CanvasImageSource | undefined;
}

/* ---------- Spatial index ---------- */

/**
 * A uniform grid of piece ids by bounds. Built once per draw (linear in the number of pieces), it
 * answers "what is in this box" and "what is under this point" without scanning everything.
 */
export class GridIndex {
  private cells = new Map<string, string[]>();
  private boxes = new Map<string, Box>();
  constructor(private size = 600) {}
  add(id: string, b: Box) {
    this.boxes.set(id, b);
    const s = this.size, x0 = Math.floor(b.x / s), y0 = Math.floor(b.y / s), x1 = Math.floor((b.x + b.w) / s), y1 = Math.floor((b.y + b.h) / s);
    // Huge pieces (long lines, giant frames) go in a shared list rather than hundreds of cells.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) { this.push('big', id); return; }
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) this.push(i + ',' + j, id);
  }
  private push(k: string, id: string) { const l = this.cells.get(k); if (l) l.push(id); else this.cells.set(k, [id]); }
  box(id: string) { return this.boxes.get(id); }
  /** Ids whose bounds meet the box (each once). */
  query(b: Box): Set<string> {
    const s = this.size, out = new Set<string>();
    const x0 = Math.floor(b.x / s), y0 = Math.floor(b.y / s), x1 = Math.floor((b.x + b.w) / s), y1 = Math.floor((b.y + b.h) / s);
    const take = (l?: string[]) => { if (l) for (const id of l) { const r = this.boxes.get(id)!; if (r.x <= b.x + b.w && r.x + r.w >= b.x && r.y <= b.y + b.h && r.y + r.h >= b.y) out.add(id); } };
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) { for (const id of this.boxes.keys()) take([id]); return out; }
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) take(this.cells.get(i + ',' + j));
    take(this.cells.get('big'));
    return out;
  }
  get count() { return this.boxes.size; }
}

/** The topmost piece under a point, from pieces in drawing order (bottom first), honoring rotation. */
export function pickAt(order: El[], idx: GridIndex, x: number, y: number, slop = 0): El | undefined {
  const near = idx.query({ x: x - slop, y: y - slop, w: slop * 2, h: slop * 2 });
  for (let i = order.length - 1; i >= 0; i--) {
    const e = order[i];
    if (!near.has(e.id) || e.boolIn || e.type === 'conn') continue;
    if (e.type === 'frame') { if (!(e.slide || e.fill)) continue; }
    let px = x, py = y;
    if (e.rot) {
      const a = -e.rot * Math.PI / 180, cx = e.x + e.w / 2, cy = e.y + e.h / 2, dx = x - cx, dy = y - cy;
      px = cx + dx * Math.cos(a) - dy * Math.sin(a); py = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    const b = e.rot ? { x: e.x, y: e.y, w: e.w, h: e.h } : idx.box(e.id)!;
    if (px >= b.x - slop && px <= b.x + b.w + slop && py >= b.y - slop && py <= b.y + b.h + slop) return e;
  }
  return undefined;
}

/* ---------- Drawing ---------- */

const pathCache = new Map<string, Path2D>();
function cached(key: string, d: () => string): Path2D {
  let p = pathCache.get(key);
  if (!p) { if (pathCache.size > 4000) pathCache.clear(); p = new Path2D(d()); pathCache.set(key, p); }
  return p;
}

/**
 * Draws pieces (already culled, in drawing order) into a canvas context whose transform maps board
 * units to device pixels. `px` is one screen pixel in board units, for hairlines and greeking.
 */
export function drawFar(g: CanvasRenderingContext2D, list: El[], col: LodColors, ctx: LodCtx, px: number) {
  const th = col.theme;
  const fillOf = (e: El, dflt: string) => paintFill(e.fill, th) || dflt;
  const bars = (e: El, x: number, y: number, w: number, h: number, ink: string) => {
    // Text greeking: one bar per line that would show, while a line is at least about 2 px tall.
    const lh = (e.size || 15) * 1.3;
    if (!e.text || lh / px < 2) return;
    const lines = Math.max(1, Math.min(Math.floor((h - 8) / lh), Math.ceil(e.text.length * (e.size || 15) * 0.5 / Math.max(1, w - 16))));
    g.fillStyle = ink; g.globalAlpha = 0.28;
    const top = y + Math.max(4, (h - lines * lh) / 2);
    for (let i = 0; i < lines; i++) g.fillRect(x + 8, top + i * lh + lh * 0.3, (w - 16) * (i === lines - 1 && lines > 1 ? 0.6 : 1), lh * 0.42);
    g.globalAlpha = 1;
  };
  for (const e of list) {
    if (e.boolIn) continue;
    const { x, y, w, h } = e;
    const turned = !!e.rot && e.type !== 'conn' && e.type !== 'pen';
    if (turned) { g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(e.rot! * Math.PI / 180); g.translate(-(x + w / 2), -(y + h / 2)); }
    switch (e.type) {
      case 'frame': {
        g.fillStyle = (e.slide ? e.fill : paintFill(e.fill, th)) || col.frame; g.fillRect(x, y, w, h);
        g.strokeStyle = col.frameLine; g.lineWidth = px; g.strokeRect(x, y, w, h);
        break;
      }
      case 'sticky': g.fillStyle = fillOf(e, '#fde68a'); g.fillRect(x, y, w, h); bars(e, x, y, w, h, '#1d2530'); break;
      case 'card': {
        g.fillStyle = col.card; g.fillRect(x, y, w, h);
        g.fillStyle = (STATUS[e.status || 'todo'] || STATUS.todo)[1]; g.fillRect(x, y, Math.max(px * 3, w * 0.03), h);
        bars(e, x, y, w, h, col.ink); break;
      }
      case 'text': bars(e, x - 4, y - 4, w + 8, h + 8, e.color || col.ink); break;
      case 'table': case 'chart': {
        g.fillStyle = col.card; g.fillRect(x, y, w, h); g.strokeStyle = col.frameLine; g.lineWidth = px; g.strokeRect(x, y, w, h);
        g.fillStyle = col.muted; g.globalAlpha = 0.25;
        if (e.type === 'table') g.fillRect(x, y, w, Math.min(h, h / Math.max(1, (e.cells || [[]]).length)));
        else for (let i = 0; i < 4; i++) { const bh = h * (0.3 + 0.15 * ((i * 7) % 4)); g.fillRect(x + w * (0.12 + i * 0.2), y + h * 0.85 - bh * 0.7, w * 0.12, bh * 0.7); }
        g.globalAlpha = 1; break;
      }
      case 'image': {
        const img = e.src && ctx.image ? ctx.image(e.src) : undefined;
        if (img) {
          const [l, t, r, b] = e.crop || [0, 0, 0, 0], iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 1, ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 1;
          try { g.drawImage(img, l * iw, t * ih, Math.max(1, (1 - l - r) * iw), Math.max(1, (1 - t - b) * ih), x, y, w, h); } catch { g.fillStyle = col.frameLine; g.fillRect(x, y, w, h); }
        } else { g.fillStyle = col.frameLine; g.fillRect(x, y, w, h); }
        break;
      }
      case 'pen': {
        const pts = e.pts || [];
        if (pts.length < 2) break;
        g.beginPath(); g.moveTo(x + pts[0][0], y + pts[0][1]);
        const step = Math.max(1, Math.floor(pts.length / 24));
        for (let i = step; i < pts.length; i += step) g.lineTo(x + pts[i][0], y + pts[i][1]);
        g.lineTo(x + pts[pts.length - 1][0], y + pts[pts.length - 1][1]);
        g.strokeStyle = e.stroke || col.ink; g.globalAlpha = e.hl ? 0.4 : 1; g.lineWidth = Math.max(px, e.sw || (e.hl ? 16 : 3)); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1;
        break;
      }
      case 'conn': {
        const geo = connGeom(e, ctx.get);
        g.strokeStyle = e.stroke || col.line; g.lineWidth = Math.max(px, 1.5); g.stroke(new Path2D(geo.d));
        break;
      }
      case 'path': {
        const p = cached(`v|${e.id}|${JSON.stringify(e.paths)}|${x}|${y}|${w}|${h}|${e.vw}|${e.vh}`, () => pathD(worldPaths(e)));
        if (e.fill && e.fill !== 'none' && typeof e.fill === 'string') { g.fillStyle = paintFill(e.fill, th) || e.fill; g.fill(p, 'evenodd'); }
        if (e.stroke && e.stroke !== 'none') { g.strokeStyle = e.stroke; g.lineWidth = Math.max(px, e.sw || 1); g.stroke(p); }
        break;
      }
      default: {
        // Shapes: rectangles, ellipses, diamonds, preset shapes, stickers, and tape.
        const fill = e.type === 'sticker' || e.type === 'tape' ? (e.fill || '#f6b8c8') : fillOf(e, col.card);
        let p: Path2D;
        if (e.type === 'rect' && e.preset && presetDef(e.preset)) {
          const def = presetDef(e.preset)!;
          p = cached(`p|${e.preset}|${w}|${h}|${JSON.stringify(e.adj || {})}`, () => presetPaths(def, w, h, e.adj).filter(q => q.fill !== 'none').map(q => q.d).join(''));
          g.save(); g.translate(x, y); g.fillStyle = fill; g.fill(p); g.strokeStyle = outlineFor(e.fill, th); g.lineWidth = px; g.stroke(p); g.restore();
          bars(e, x, y, w, h, col.ink); break;
        }
        p = new Path2D();
        if (e.type === 'ellipse') p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else if (e.type === 'diamond') { p.moveTo(x + w / 2, y); p.lineTo(x + w, y + h / 2); p.lineTo(x + w / 2, y + h); p.lineTo(x, y + h / 2); p.closePath(); }
        else p.rect(x, y, w, h);
        g.fillStyle = fill; g.fill(p);
        if (e.type !== 'sticker' && e.type !== 'tape' && e.stroke !== 'none') { g.strokeStyle = outlineFor(e.fill, th); g.lineWidth = px; g.stroke(p); }
        bars(e, x, y, w, h, col.ink);
      }
    }
    if (turned) g.restore();
  }
}

/** Frame names in the far view: small labels above frames, a steady size on screen. */
export function drawFrameNames(g: CanvasRenderingContext2D, frames: El[], cam: LodCam, dpr: number, color: string) {
  g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = '500 11px Inter, system-ui, sans-serif'; g.fillStyle = color; g.textBaseline = 'bottom';
  for (const f of frames) {
    const sx = cam.x + f.x * cam.z, sy = cam.y + f.y * cam.z, w = f.w * cam.z;
    if (w < 24) continue;
    const name = f.slide ? `${f.slide}  ${f.text || ''}` : f.text || 'Frame';
    let t = name; while (t.length > 1 && g.measureText(t).width > w) t = t.slice(0, -2) + '…';
    g.fillText(t, sx, sy - 4);
  }
  g.restore();
}
