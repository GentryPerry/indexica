import { connGeom, type Pt } from './connectors';
import { s, today } from './dom';
import { measure, textStyle, wrapEl, type TextStyle } from './geometry';
import { STICKERS, tapeOutline, tapePattern } from './stickers';
import { STATUS, type El, type Head, type Lookup } from './types';
import { cellBox, colFractions, rowsOf } from './table';
import { hashId, roughPath, shapeOutline, wobble } from './sketch';
import { SURFACE, chip, inkOn, outlineFor, paintFill, type Theme } from './palette';

/** What the renderer needs to know about where it is drawing. */
export interface RenderCtx {
  /** True when drawing for export: fixed light colors, no shadows, no invisible hit areas. */
  exp: boolean;
  /** Which palette to paint with. Exports are always light. */
  theme: Theme;
  ink: string;
  /** Default color for connector lines. */
  line: string;
  muted: string;
  canvas: string;
  frame: string;
  frameLine: string;
  /** Element whose text is hidden because it is being edited. */
  hideId: string | null;
  get: Lookup;
  /** Momentary swing of a cable connector, if it is moving. */
  sway?: (id: string) => Pt | undefined;
  /** The table cell being edited, whose text is hidden under the editor. */
  editCell?: [number, number] | null;
  /** Data URL of a stored picture, once it has loaded. */
  image?: (id: string) => string | undefined;
  /** The painted surface under a piece (its frame's background), so default text stays readable. */
  under?: (e: El) => string | undefined;
  /** Accent color, for slide numbers. */
  accent?: string;
  /** Screen zoom. Frame names keep a steady size on screen when zoomed out. */
  zoom?: number;
}

/** Stored colors that mean "the ink color": they follow the theme instead of vanishing on a dark canvas. */
const INKISH = new Set(['#2b2f3a', '#17202d', '#1d2530', '#2b3545']);
const lineColor = (stroke: string | undefined, c: RenderCtx) => !stroke || (c.theme === 'dark' && INKISH.has(stroke.toLowerCase())) ? c.line : stroke;
const outline = (e: El, c: RenderCtx) => e.stroke && !INKISH.has(e.stroke.toLowerCase()) ? e.stroke : outlineFor(e.fill, c.theme);

/** Where a line of text starts and how it is anchored, for an element's alignment choice. */
function lineStart(e: El, x: number, w: number, pad: number, fallback: 'left' | 'center' | 'right'): [number, string] {
  const a = e.align || fallback;
  return a === 'center' ? [x + w / 2, 'middle'] : a === 'right' ? [x + w - pad, 'end'] : [x + pad, 'start'];
}

function textBlock(lines: string[], x: number, y: number, st: TextStyle, fill: string, anchor = 'start'): SVGElement {
  const t = s('text', { x, y, 'font-size': st.size, 'font-family': st.family, 'font-weight': st.weight, 'font-style': st.italic ? 'italic' : null, fill, 'text-anchor': anchor, 'pointer-events': 'none' });
  lines.forEach((ln, i) => t.append(s('tspan', { x, dy: i ? st.size * 1.3 : 0 }, ln || ' ')));
  return t;
}

function plug(at: Pt, angle: number, color: string): SVGElement {
  return s('g', { transform: `translate(${at.x} ${at.y}) rotate(${angle * 180 / Math.PI})`, 'pointer-events': 'none' },
    s('rect', { x: -7, y: -1.6, width: 8, height: 3.2, rx: 1.4, fill: '#aeb6c4' }),
    s('rect', { x: 0, y: -3, width: 3, height: 6, fill: '#8992a3' }),
    s('rect', { x: 3, y: -5, width: 15, height: 10, rx: 2.5, fill: '#1b1e26' }),
    s('rect', { x: 13, y: -5, width: 3, height: 10, fill: color }));
}

const DASH: Record<string, (w: number) => string> = { dash: w => `${w * 4} ${w * 3}`, dot: w => `0.1 ${w * 3}` };
const dashOf = (e: El, w: number) => e.dash ? DASH[e.dash](w) : null;

/** An arrowhead at `at`, pointing along `angle`. */
function headShape(kind: Head, at: Pt, angle: number, color: string): SVGElement | null {
  const cos = Math.cos(angle), sin = Math.sin(angle), pt = (back: number, side: number) => `${at.x - back * cos - side * sin},${at.y - back * sin + side * cos}`;
  // A slightly swept head: the notch at the back reads as finer than a plain triangle.
  if (kind === 'triangle') return s('path', { d: `M${at.x} ${at.y}L${pt(10.5, 4.6)}L${pt(8.2, 0)}L${pt(10.5, -4.6)}Z`, fill: color, stroke: color, 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
  if (kind === 'arrow') return s('polyline', { points: `${pt(9, 5.2)} ${at.x},${at.y} ${pt(9, -5.2)}`, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (kind === 'circle') return s('circle', { cx: at.x - 3.5 * cos, cy: at.y - 3.5 * sin, r: 3.5, fill: color });
  if (kind === 'bar') return s('polyline', { points: `${pt(1, 5.5)} ${pt(1, -5.5)}`, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
  return null;
}

/** A smooth path through drawn points, using midpoints as the joins. */
function smoothPath(pts: number[][], x: number, y: number): string {
  if (pts.length < 3) return 'M' + pts.map(p => `${x + p[0]} ${y + p[1]}`).join('L');
  let d = `M${x + pts[0][0]} ${y + pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${x + pts[i][0]} ${y + pts[i][1]} ${x + mx} ${y + my}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${x + z[0]} ${y + z[1]}`;
}

function renderConn(g: SVGElement, e: El, c: RenderCtx) {
  const geom = connGeom(e, c.get, c.sway?.(e.id)), color = lineColor(e.stroke, c), cable = e.style === 'cable';
  if (cable) {
    const cord = e.stroke || '#2b2f3a';
    g.append(
      s('path', { d: geom.d, fill: 'none', stroke: cord, 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('path', { d: geom.d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.28, 'stroke-width': 1.2, 'stroke-linecap': 'round', 'pointer-events': 'none' }),
      plug(geom.p, geom.a0, cord), plug(geom.q, geom.a1 + Math.PI, cord));
  } else {
    g.append(s('path', { d: e.sketch ? roughPath(geom.pts, hashId(e.id), 1.6) : geom.d, fill: 'none', stroke: color, 'stroke-width': e.sketch ? 1.4 : 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': dashOf(e, 1.6) }));
    for (const end of [headShape(e.head || 'triangle', geom.q, geom.a1, color), headShape(e.tail || 'none', geom.p, geom.a0 + Math.PI, color)]) if (end) { end.setAttribute('pointer-events', 'none'); g.append(end); }
  }
  // Flow: dots travelling from the start to the end. Drawn on screen only; exports show the still line.
  if (e.flow && !c.exp) g.append(s('path', { class: 'flow', d: geom.d, fill: 'none', stroke: cable ? '#ffffff' : color, 'stroke-opacity': cable ? 0.75 : 1, 'stroke-width': cable ? 2.6 : 5, 'stroke-linecap': 'round', 'stroke-dasharray': '0.1 12', 'pointer-events': 'none' }));
  if (!c.exp) g.append(s('path', { d: geom.d, fill: 'none', stroke: 'transparent', 'stroke-width': 16 }));
  if (e.text && c.hideId !== e.id) {
    const st = textStyle(e), w = measure(e.text, st.size, st.weight, st.family, st.italic) + 16, h = st.size * 1.3 + 8;
    g.append(s('rect', { x: geom.label.x - w / 2, y: geom.label.y - h / 2, width: w, height: h, rx: h / 2, fill: c.frame, stroke: c.frameLine }),
      textBlock([e.text], geom.label.x, geom.label.y + st.size * 0.35, st, c.ink, 'middle'));
  }
}

const autoInkOr = (color: string | undefined, fallback: string) => !color || INKISH.has(color.toLowerCase()) ? fallback : color;

/** Draw one element as an SVG group tagged with its id. */
export function renderEl(e: El, c: RenderCtx): SVGElement {
  const g = s('g', { 'data-id': e.id }), hide = c.hideId === e.id, shadow = c.exp ? null : 'url(#sh)';
  const { x, y, w, h } = e, st = textStyle(e), lh = st.size * 1.3;
  if (e.type === 'sticky') {
    const fill = paintFill(e.fill, c.theme);
    g.append(s('rect', { x, y, width: w, height: h, rx: 3, fill, filter: shadow }));
    if (!hide) { const [tx, anchor] = lineStart(e, x, w, 14, 'left'); g.append(textBlock(wrapEl(e, w - 28), tx, y + 14 + st.size, st, inkOn(fill, e.color, c.theme), anchor)); }
  } else if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond') {
    const fill = paintFill(e.fill, c.theme), line = outline(e, c);
    const a = e.sketch ? { fill, stroke: 'none' } : { fill, stroke: line, 'stroke-width': 1.5, 'stroke-dasharray': dashOf(e, 1.5) };
    g.append(e.type === 'rect' ? s('rect', { x, y, width: w, height: h, rx: Math.min(10, w / 4, h / 4), ...a })
      : e.type === 'ellipse' ? s('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...a })
      : s('polygon', { points: `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`, ...a }));
    if (e.sketch) g.append(s('path', { d: roughPath(shapeOutline(e.type, x, y, w, h), hashId(e.id), wobble(w, h)), fill: 'none', stroke: line, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': dashOf(e, 1.5), 'pointer-events': 'none' }));
    if (!hide) { const ls = wrapEl(e, w - 24); const [tx, anchor] = lineStart(e, x, w, 12, 'center'); g.append(textBlock(ls, tx, y + h / 2 - ls.length * lh / 2 + st.size * 0.97, st, inkOn(fill, e.color, c.theme), anchor)); }
  } else if (e.type === 'text') {
    g.append(s('rect', { x, y, width: w, height: h, fill: 'transparent' }));
    if (!hide) { const [tx, anchor] = lineStart(e, x, w, 2, 'left'); g.append(textBlock(wrapEl(e, w - 4), tx, y + 4 + st.size * 0.95, st, inkOn(c.under?.(e), e.color, c.theme), anchor)); }
  } else if (e.type === 'card') {
    const status = e.status || 'todo', [label, col] = STATUS[status] || STATUS.todo, late = !!e.due && e.due < today() && status !== 'done';
    const sf = SURFACE[c.theme], ch = chip(col, c.theme), done = status === 'done';
    g.append(s('rect', { x, y, width: w, height: h, rx: 10, fill: sf.card, stroke: sf.cardLine, filter: shadow }));
    if (!hide) g.append(textBlock(wrapEl(e, w - 28).slice(0, 2), x + 14, y + 12 + st.size, st, done && !e.color ? c.muted : inkOn(sf.card, e.color, c.theme)));
    const pill: TextStyle = { size: 11, weight: 600, family: textStyle({ ...e, font: undefined }).family, italic: false };
    const pw = measure(label, 11, 600) + 26, py = y + h - 32;
    g.append(s('rect', { x: x + 12, y: py, width: pw, height: 20, rx: 10, fill: ch.bg, 'pointer-events': 'none' }),
      s('circle', { cx: x + 22, cy: py + 10, r: 3, fill: ch.dot, 'pointer-events': 'none' }),
      textBlock([label], x + 29, py + 14, pill, ch.text));
    const extra = [e.due && 'Due ' + e.due, e.notes && 'Notes'].filter(Boolean).join(' · ');
    if (extra) g.append(textBlock([extra], x + 20 + pw, py + 14, { ...pill, weight: late ? 600 : 500 }, late ? (c.theme === 'dark' ? '#ff9a9a' : '#c23434') : c.muted));
  } else if (e.type === 'frame') {
    g.append(s('rect', { x, y, width: w, height: h, rx: 12, fill: paintFill(e.fill, c.theme) || c.frame, stroke: c.frameLine, 'stroke-width': 1, 'pointer-events': 'none' }));
    if (!c.exp) g.append(s('rect', { x, y, width: w, height: h, fill: 'none', stroke: 'transparent', 'stroke-width': 12, 'pointer-events': 'stroke' }));
    // A slide shows its number in a small accent chip before its name.
    const k = c.exp ? 1 : 1 / Math.min(1, Math.max(0.2, c.zoom || 1)), ls: TextStyle = { ...st, size: st.size * k };
    let lx = x + 2 * k;
    if (e.slide) {
      const n = String(e.slide), cw = (measure(n, 11, 600) + 12) * k, chip: TextStyle = { size: 11 * k, weight: 600, family: st.family, italic: false };
      g.append(s('rect', { x, y: y - 24 * k, width: cw, height: 18 * k, rx: 5 * k, fill: c.accent || '#2447d6' }), textBlock([n], x + cw / 2, y - 11 * k, chip, '#ffffff', 'middle'));
      lx = x + cw + 6 * k;
    }
    if (!hide) { const t = textBlock([e.text || 'Frame'], lx, y - 9 * k, ls, autoInkOr(e.color, c.muted)); t.removeAttribute('pointer-events'); g.append(t); }
  } else if (e.type === 'pen') {
    const d = smoothPath(e.pts || [], x, y), sw = e.sw || (e.hl ? 16 : 2.5);
    g.append(s('path', { d, fill: 'none', stroke: e.hl ? (e.stroke || '#f5c518') : c.theme === 'dark' ? autoInkOr(e.stroke, c.ink) : e.stroke || c.ink, 'stroke-width': sw, 'stroke-opacity': e.hl ? 0.4 : null, 'stroke-linecap': e.hl ? 'butt' : 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': e.hl ? null : dashOf(e, sw) }));
    if (!c.exp) g.append(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(14, sw + 8) }));
  } else if (e.type === 'sticker') {
    const def = STICKERS[e.shape || ''] || STICKERS.star, fill = e.fill || '#f5c518';
    const inner = s('g', { transform: `translate(${x} ${y}) scale(${w / 100} ${h / 100})` });
    // A white die-cut border behind the shape, like a real sticker.
    for (const l of def.layers) if (l.paint === 'fill') inner.append(s('path', { d: l.d, fill: '#ffffff', stroke: '#ffffff', 'stroke-width': 9, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', filter: shadow }));
    for (const l of def.layers) inner.append(l.paint === 'line'
      ? s('path', { d: l.d, fill: 'none', stroke: '#ffffff', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' })
      : s('path', { d: l.d, fill: l.paint === 'white' ? '#ffffff' : fill }));
    g.append(inner);
  } else if (e.type === 'tape') {
    const outline = tapeOutline(x, y, w, h), marks = tapePattern(e.pattern || 'stripes', x, y, w, h), clip = 'tape-' + e.id + (c.exp ? '-x' : '');
    g.append(s('clipPath', { id: clip }, s('path', { d: outline })), s('path', { d: outline, fill: e.fill || '#2f6fed', 'fill-opacity': 0.78 }));
    if (marks.d) g.append(s('path', { d: marks.d, 'clip-path': `url(#${clip})`, 'pointer-events': 'none', ...(marks.filled ? { fill: '#ffffff', 'fill-opacity': 0.6 } : { fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.5, 'stroke-width': marks.d && e.pattern === 'grid' ? 1.2 : 4 }) }));
  } else if (e.type === 'image') {
    const href = e.src ? c.image?.(e.src) : undefined;
    if (href) g.append(s('image', { x, y, width: w, height: h, href, preserveAspectRatio: 'none' }));
    else g.append(s('rect', { x, y, width: w, height: h, rx: 6, fill: SURFACE[c.theme].head, stroke: c.frameLine, 'stroke-dasharray': '6 4' }),
      textBlock(['Loading picture'], x + w / 2, y + h / 2 + 4, { size: 13, weight: 500, family: st.family, italic: false }, c.muted, 'middle'));
  } else if (e.type === 'table') {
    const rows = rowsOf(e), fr = colFractions(e), sf = SURFACE[c.theme], line = sf.grid, r8 = 8;
    g.append(s('rect', { x, y, width: w, height: h, rx: r8, fill: sf.card, stroke: sf.cardLine, filter: shadow }));
    if (e.header) g.append(s('path', { d: `M${x + 0.5} ${y + h / rows}V${y + r8}Q${x + 0.5} ${y + 0.5} ${x + r8} ${y + 0.5}H${x + w - r8}Q${x + w - 0.5} ${y + 0.5} ${x + w - 0.5} ${y + r8}V${y + h / rows}Z`, fill: sf.head, 'pointer-events': 'none' }));
    let grid = '';
    for (let r = 1; r < rows; r++) grid += `M${x} ${y + r * h / rows}H${x + w}`;
    for (let k = 1, acc = 0; k < fr.length; k++) { acc += fr[k - 1]; grid += `M${x + acc * w} ${y}V${y + h}`; }
    if (grid) g.append(s('path', { d: grid, stroke: line, 'stroke-width': 1, fill: 'none', 'pointer-events': 'none' }));
    (e.cells || []).forEach((row, r) => row.forEach((text, k) => {
      if (!text || (hide && c.editCell && c.editCell[0] === r && c.editCell[1] === k)) return;
      const b = cellBox(e, r, k), cs = r === 0 && e.header ? { ...st, weight: Math.max(st.weight, 600) } : st;
      const lines = wrapEl({ ...e, text, weight: cs.weight }, b.w - 16).slice(0, Math.max(1, Math.floor((b.h - 8) / lh)));
      g.append(textBlock(lines, b.x + 8, b.y + 8 + cs.size * 0.95, cs, inkOn(sf.card, e.color, c.theme)));
    }));
  } else if (e.type === 'conn') {
    renderConn(g, e, c);
  }
  if (e.rot && e.type !== 'conn') g.setAttribute('transform', `rotate(${e.rot} ${x + w / 2} ${y + h / 2})`);
  return g;
}
