import { connGeom, type Pt } from './connectors';
import { s, today } from './dom';
import { measure, textStyle, wrapEl, type TextStyle } from './geometry';
import { STICKERS, tapeOutline, tapePattern } from './stickers';
import { STATUS, type El, type Lookup } from './types';

/** What the renderer needs to know about where it is drawing. */
export interface RenderCtx {
  /** True when drawing for export: fixed light colors, no shadows, no invisible hit areas. */
  exp: boolean;
  ink: string;
  muted: string;
  canvas: string;
  frame: string;
  frameLine: string;
  /** Element whose text is hidden because it is being edited. */
  hideId: string | null;
  get: Lookup;
  /** Momentary swing of a cable connector, if it is moving. */
  sway?: (id: string) => Pt | undefined;
  /** Data URL of a stored picture, once it has loaded. */
  image?: (id: string) => string | undefined;
}

const DARK = '#1d2530';
/** Status pill fills, darker than the status colors so white text stays readable. */
const PILL: Record<string, string> = { todo: '#5d697c', doing: '#2358c9', blocked: '#b93232', done: '#1f7a4d' };

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

function renderConn(g: SVGElement, e: El, c: RenderCtx) {
  const geom = connGeom(e, c.get, c.sway?.(e.id)), color = e.stroke || c.ink, cable = e.style === 'cable';
  if (cable) {
    const cord = e.stroke || '#2b2f3a';
    g.append(
      s('path', { d: geom.d, fill: 'none', stroke: cord, 'stroke-width': 5, 'stroke-linecap': 'round' }),
      s('path', { d: geom.d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.28, 'stroke-width': 1.2, 'stroke-linecap': 'round', 'pointer-events': 'none' }),
      plug(geom.p, geom.a0, cord), plug(geom.q, geom.a1 + Math.PI, cord));
  } else {
    const { q, a1: a } = geom, L = 11, W = 0.42;
    g.append(
      s('path', { d: geom.d, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('polygon', { points: `${q.x},${q.y} ${q.x - L * Math.cos(a - W)},${q.y - L * Math.sin(a - W)} ${q.x - L * Math.cos(a + W)},${q.y - L * Math.sin(a + W)}`, fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' }));
  }
  // Flow: dots travelling from the start to the end. Drawn on screen only; exports show the still line.
  if (e.flow && !c.exp) g.append(s('path', { class: 'flow', d: geom.d, fill: 'none', stroke: cable ? '#ffffff' : color, 'stroke-opacity': cable ? 0.75 : 1, 'stroke-width': cable ? 2.6 : 5, 'stroke-linecap': 'round', 'stroke-dasharray': '0.1 12', 'pointer-events': 'none' }));
  if (!c.exp) g.append(s('path', { d: geom.d, fill: 'none', stroke: 'transparent', 'stroke-width': 16 }));
  if (e.text && c.hideId !== e.id) {
    const st = textStyle(e), w = measure(e.text, st.size, st.weight, st.family, st.italic) + 14, h = st.size * 1.3 + 6;
    g.append(s('rect', { x: geom.label.x - w / 2, y: geom.label.y - h / 2, width: w, height: h, rx: 5, fill: c.frame, stroke: color, 'stroke-opacity': 0.25 }),
      textBlock([e.text], geom.label.x, geom.label.y + st.size * 0.35, st, c.ink, 'middle'));
  }
}

/** Draw one element as an SVG group tagged with its id. */
export function renderEl(e: El, c: RenderCtx): SVGElement {
  const g = s('g', { 'data-id': e.id }), hide = c.hideId === e.id, shadow = c.exp ? null : 'url(#sh)';
  const { x, y, w, h } = e, st = textStyle(e), lh = st.size * 1.3;
  if (e.type === 'sticky') {
    g.append(s('rect', { x, y, width: w, height: h, fill: e.fill, filter: shadow }));
    if (!hide) { const [tx, anchor] = lineStart(e, x, w, 12, 'left'); g.append(textBlock(wrapEl(e, w - 24), tx, y + 12 + st.size, st, e.color || DARK, anchor)); }
  } else if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond') {
    const a = { fill: e.fill, stroke: '#2b3545', 'stroke-width': 1.5 };
    g.append(e.type === 'rect' ? s('rect', { x, y, width: w, height: h, rx: 6, ...a })
      : e.type === 'ellipse' ? s('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...a })
      : s('polygon', { points: `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`, ...a }));
    if (!hide) { const ls = wrapEl(e, w - 24); const [tx, anchor] = lineStart(e, x, w, 12, 'center'); g.append(textBlock(ls, tx, y + h / 2 - ls.length * lh / 2 + st.size * 0.97, st, e.color || DARK, anchor)); }
  } else if (e.type === 'text') {
    g.append(s('rect', { x, y, width: w, height: h, fill: 'transparent' }));
    if (!hide) { const [tx, anchor] = lineStart(e, x, w, 2, 'left'); g.append(textBlock(wrapEl(e, w - 4), tx, y + 4 + st.size * 0.95, st, e.color || c.ink, anchor)); }
  } else if (e.type === 'card') {
    const status = e.status || 'todo', [label, col] = STATUS[status] || STATUS.todo, late = !!e.due && e.due < today() && status !== 'done';
    g.append(s('rect', { x, y, width: w, height: h, rx: 8, fill: '#ffffff', stroke: '#c3ccda', filter: shadow }),
      s('rect', { x: x + 6, y: y + 8, width: 4, height: h - 16, rx: 2, fill: col, 'pointer-events': 'none' }));
    if (!hide) g.append(textBlock(wrapEl(e, w - 30).slice(0, 2), x + 18, y + 10 + st.size, st, e.color || DARK));
    const pill: TextStyle = { size: 11, weight: 600, family: textStyle({ ...e, font: undefined }).family, italic: false };
    const pw = measure(label, 11, 600) + 16;
    g.append(s('rect', { x: x + 18, y: y + h - 28, width: pw, height: 18, rx: 9, fill: PILL[status] || col, 'pointer-events': 'none' }),
      textBlock([label], x + 18 + pw / 2, y + h - 15, pill, '#ffffff', 'middle'));
    const extra = [e.due && 'Due ' + e.due, e.notes && 'Notes'].filter(Boolean).join(' · ');
    if (extra) g.append(textBlock([extra], x + 26 + pw, y + h - 15, { ...pill, weight: late ? 600 : 400 }, late ? '#b93232' : '#5d697c'));
  } else if (e.type === 'frame') {
    g.append(s('rect', { x, y, width: w, height: h, fill: c.frame, stroke: c.frameLine, 'stroke-width': 1, 'pointer-events': 'none' }));
    if (!c.exp) g.append(s('rect', { x, y, width: w, height: h, fill: 'none', stroke: 'transparent', 'stroke-width': 12, 'pointer-events': 'stroke' }));
    if (!hide) { const t = textBlock([e.text || 'Frame'], x, y - 7, st, e.color || c.muted); t.removeAttribute('pointer-events'); g.append(t); }
  } else if (e.type === 'pen') {
    const d = 'M' + (e.pts || []).map(p => (x + p[0]) + ' ' + (y + p[1])).join('L');
    g.append(s('path', { d, fill: 'none', stroke: e.stroke || c.ink, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (!c.exp) g.append(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }));
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
    else g.append(s('rect', { x, y, width: w, height: h, rx: 4, fill: '#dfe5ee', stroke: '#9aa8c4', 'stroke-dasharray': '6 4' }),
      textBlock(['Loading picture'], x + w / 2, y + h / 2 + 4, { size: 13, weight: 500, family: st.family, italic: false }, '#5d697c', 'middle'));
  } else if (e.type === 'conn') {
    renderConn(g, e, c);
  }
  if (e.rot && e.type !== 'conn') g.setAttribute('transform', `rotate(${e.rot} ${x + w / 2} ${y + h / 2})`);
  return g;
}
