import { connGeom, type Pt } from './connectors';
import { s, today } from './dom';
import { layoutText, measure, textStyle, wrap, wrapEl, type TextStyle } from './geometry';
import { isRich } from './richtext';
import { phPrompt } from './deck';
import { STICKERS, tapeOutline, tapePattern } from './stickers';
import { FONTS, STATUS, type El, type Head, type Lookup } from './types';
import { cellBox, cellLook, colFractions, rowsOf } from './table';
import { adjustments } from './picture';
import { chartLayout } from './chart';
import { presetDef, presetPaths, presetText } from './presetgeom';
import { hashId, roughPath, shapeOutline, wobble } from './sketch';
import { SURFACE, chip, inkOn, outlineFor, paintFill, type Theme } from './palette';
import { flatten, pathD, scaleOf } from './vector';
import { BRUSHES, brushOutline, outlineD, profileOutline, shaped } from './brush';
import { fillLayers, gradientGeom, isGrad, strokeLayers, type Paint } from './paint';
import { outlineOf } from './boolean';

/** What the renderer needs to know about where it is drawing. */
export interface RenderCtx {
  /** A sticky author's display name, or '' while unknown. */
  nameOf?: (id: string) => string;
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
  /** Accent colors for charts: the page's deck theme. */
  accents?: () => string[];
  /** A slide's footer pieces (date, text, number), drawn with the slide like a master. */
  foot?: (f: El) => El[];
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

/** Baseline of a placeholder's first line, anchored top, middle, or bottom in its box. */
function phTop(e: El, lines: number, size: number): number {
  return blockTop(e, lines * size * 1.3) + size * 0.95;
}
/** Top of a text piece's lines: placeholders anchor them top, middle, or bottom in their box. */
function blockTop(e: El, height: number): number {
  if (!e.ph) return e.y + 4;
  return e.va === 'bottom' ? e.y + e.h - height - 4 : e.va === 'middle' ? e.y + (e.h - height) / 2 : e.y + 4;
}
/** Text with paragraphs (levels, bullets, numbers, spacing): one text node per line, so each can have its own size. */
function richText(e: El, ink: string): SVGElement {
  const st = textStyle(e), { lines, height } = layoutText(e, e.w - 4), top = blockTop(e, height), g = s('g', { 'pointer-events': 'none' });
  const a = e.align || 'left';
  for (const ln of lines) {
    const ls: TextStyle = { ...st, size: ln.size };
    const tx = a === 'center' ? e.x + 2 + ln.x + (e.w - 4 - ln.x) / 2 : a === 'right' ? e.x + e.w - 2 : e.x + 2 + ln.x;
    if (ln.marker) g.append(textBlock([ln.marker], e.x + 2 + ln.bx!, top + ln.base, ls, ink));
    if (ln.text) g.append(textBlock([ln.text], tx, top + ln.base, ls, ink, a === 'center' ? 'middle' : a === 'right' ? 'end' : 'start'));
  }
  return g;
}

/**
 * A picture: its cropped window of the image, clipped to rounded corners or an oval, with its
 * adjustments as an SVG filter and an optional border.
 */
function pictureNodes(e: El, href: string, c: RenderCtx): SVGElement[] {
  const { x, y, w, h } = e, [l, t, r, b] = e.crop || [0, 0, 0, 0], tag = `${e.id}${c.exp ? '-x' : ''}`, out: SVGElement[] = [];
  const img = s('image', { x: 0, y: 0, width: 1, height: 1, href, preserveAspectRatio: 'none' });
  const ad = adjustments(e);
  if (ad) {
    const f = (ch: string) => s(ch, { type: 'linear', slope: ad.slope, intercept: ad.intercept });
    out.push(s('filter', { id: 'pf-' + tag, 'color-interpolation-filters': 'sRGB' }, s('feColorMatrix', { type: 'saturate', values: ad.sat }), s('feComponentTransfer', null, f('feFuncR'), f('feFuncG'), f('feFuncB'))));
    img.setAttribute('filter', `url(#pf-${tag})`);
  }
  const win = s('svg', { x, y, width: w, height: h, viewBox: `${l} ${t} ${Math.max(0.001, 1 - l - r)} ${Math.max(0.001, 1 - t - b)}`, preserveAspectRatio: 'none', overflow: 'hidden' }, img);
  const rad = Math.min(e.rad || 0, w / 2, h / 2), shape = () => e.oval ? s('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }) : s('rect', { x, y, width: w, height: h, rx: rad });
  // The clip goes on a wrapper: on the inner svg itself it would be read in the image's own 0 to 1 units.
  if (e.oval || rad) { out.push(s('clipPath', { id: 'pc-' + tag }, shape()), s('g', { 'clip-path': `url(#pc-${tag})` }, win)); }
  else out.push(win);
  if (e.stroke && e.stroke !== 'none' && (e.sw || 0) > 0) { const o = shape(); o.setAttribute('fill', 'none'); o.setAttribute('stroke', e.stroke); o.setAttribute('stroke-width', String(e.sw)); o.setAttribute('pointer-events', 'none'); out.push(o); }
  return out;
}

/** Insert buttons in an empty content placeholder, as in PowerPoint: a table or a picture. */
function insertTiles(e: El, c: RenderCtx): SVGElement {
  const u = Math.max(28, Math.min(56, Math.min(e.w, e.h) * 0.14)), gap = u * 0.4, cx = e.x + e.w / 2, cy = e.y + e.h * 0.6, g = s('g');
  const tiles: [string, string, string][] = [
    ['table', 'Insert a table', 'M4 5.5h12v9H4zM4 8.5h12M4 11.5h12M8 5.5v9M12 5.5v9'],
    ['chart', 'Insert a chart', 'M4.5 15.5V10M8.5 15.5V6M12.5 15.5V8.5M16.5 15.5V4.5M3 15.5h14'],
    ['picture', 'Insert a picture', 'M4 5h12v10H4zM4 13l3.5-3.5 2.5 2.5 2-2 4 3.5M12.5 8.2h.01'],
  ];
  tiles.forEach(([act, label, d], i) => {
    const x = cx + (i - tiles.length / 2) * (u + gap) + gap / 2, y = cy - u / 2;
    g.append(s('g', { 'data-ph-act': act, style: 'cursor:pointer' }, s('title', null, label),
      s('rect', { x, y, width: u, height: u, rx: u * 0.18, fill: c.frame, stroke: c.muted, 'stroke-opacity': 0.35, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
      s('path', { d, transform: `translate(${x + u * 0.15} ${y + u * 0.15}) scale(${u * 0.7 / 20})`, fill: 'none', stroke: c.muted, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' })));
  });
  return g;
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
/** Outline path data for a vector's stroke with a width profile, one outline per subpath. */
function profileD(e: El, width: number, x: number, y: number, sx: number, sy: number): string {
  return (e.paths || []).map(sp => outlineD(profileOutline(flatten(sp, 0.75).map(([px, py]) => [px * sx, py * sy]), width, e.profile!), x, y)).join(' ');
}

export function renderEl(e: El, c: RenderCtx): SVGElement {
  // Operands of a live boolean are not drawn: the result shows what they make together. Text on them
  // stays, drawn over the result, so a note or labeled shape keeps its words inside a boolean.
  if (e.boolIn) {
    const g0 = s('g', { 'data-op': e.id });
    if (e.text && e.text.trim() && ['sticky', 'rect', 'ellipse', 'diamond', 'card'].includes(e.type)) {
      const full = renderEl({ ...e, boolIn: undefined, mask: undefined }, c);
      for (const t of [...full.querySelectorAll('text')]) g0.append(t);
      const turn = full.getAttribute('transform'); if (turn) g0.setAttribute('transform', turn);
    }
    return g0;
  }
  const g = s('g', { 'data-id': e.id }), hide = c.hideId === e.id, shadow = c.exp ? null : 'url(#sh)';
  const { x, y, w, h } = e, st = textStyle(e), lh = st.size * 1.3;
  if (e.type === 'sticky') {
    const fill = paintFill(e.fill, c.theme);
    g.append(s('rect', { x, y, width: w, height: h, rx: 3, fill, filter: shadow }));
    const ink = inkOn(fill, e.color, c.theme);
    if (!hide) { const [tx, anchor] = lineStart(e, x, w, 14, 'left'); g.append(textBlock(wrapEl(e, w - 28), tx, y + 14 + st.size, st, ink, anchor)); }
    // The author's name sits small at the foot of the note, as in FigJam.
    const who = e.author && !e.noAuthor && c.nameOf ? c.nameOf(e.author) : '';
    if (who) {
      const t = textBlock([who.length > 32 ? who.slice(0, 31) + '…' : who], x + 14, y + h - 12, { size: 11, weight: 500, family: FONTS.sans.stack, italic: false }, ink);
      t.setAttribute('fill-opacity', '0.6'); g.append(t);
    }
  } else if (e.type === 'rect' && e.preset && presetDef(e.preset)) {
    // A preset shape: each of its paths fills and outlines on its own, as DrawingML draws them.
    const def = presetDef(e.preset)!, fill = paintFill(e.fill, c.theme) || 'none', line = outline(e, c), ps = presetPaths(def, w, h, e.adj);
    const sw = e.sw ?? 1.5, pg = s('g', { transform: `translate(${x} ${y})` });
    for (const p of ps) {
      if (p.fill !== 'none') {
        pg.append(s('path', { d: p.d, fill }));
        const shadeBy: Record<string, [string, number]> = { darken: ['#000000', 0.4], darkenLess: ['#000000', 0.2], lighten: ['#ffffff', 0.4], lightenLess: ['#ffffff', 0.2] };
        const sh = shadeBy[p.fill]; if (sh) pg.append(s('path', { d: p.d, fill: sh[0], 'fill-opacity': sh[1], 'pointer-events': 'none' }));
      }
      if (p.stroke && e.stroke !== 'none') pg.append(s('path', { d: p.d, fill: 'none', stroke: line, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-dasharray': dashOf(e, sw), 'pointer-events': p.fill === 'none' ? 'stroke' : null }));
      if (p.fill === 'none' && !c.exp) pg.append(s('path', { d: p.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }));
    }
    g.append(pg);
    if (!hide && e.text) {
      const tb = presetText(def, w, h, e.adj), bx = x + tb.x, by = y + tb.y, ls = wrapEl(e, tb.w - 16), [tx, anchor] = lineStart(e, bx, tb.w, 8, 'center');
      g.append(textBlock(ls, tx, by + tb.h / 2 - ls.length * lh / 2 + st.size * 0.97, st, inkOn(fill === 'none' ? c.under?.(e) : fill, e.color, c.theme), anchor));
    }
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
    const ink = inkOn(c.under?.(e), e.color, c.theme), empty = !e.text || !e.text.trim() || e.ph === 'picture';
    if (e.ph && empty) {
      // An empty placeholder shows a dashed box and its prompt on the board, and nothing in exports.
      if (!c.exp && (e.ph === 'body' || e.ph === 'body2')) g.append(insertTiles(e, c));
      if (!c.exp) {
        g.append(s('rect', { x, y, width: w, height: h, rx: 4, fill: 'none', stroke: c.muted, 'stroke-width': 1, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke', 'stroke-opacity': 0.55, 'pointer-events': 'none' }));
        if (!hide && e.bullets && e.ph !== 'picture') {
          const t = richText({ ...e, text: phPrompt(e.ph), weight: Math.min(st.weight, 500) }, ink); t.setAttribute('fill-opacity', '0.45'); g.append(t);
        } else if (!hide) {
          const pst = { ...st, weight: Math.min(st.weight, 500) }, ls = wrap(phPrompt(e.ph), w - 4, pst.size, pst.weight, pst.family, pst.italic);
          const [tx, anchor] = e.ph === 'picture' ? [x + w / 2, 'middle'] : lineStart(e, x, w, 2, 'left');
          const t = textBlock(ls, tx, phTop(e, ls.length, pst.size), pst, ink, anchor); t.setAttribute('fill-opacity', '0.45'); g.append(t);
        }
      }
    } else if (!hide && isRich(e)) g.append(richText(e, ink));
    else if (!hide) { const ls = wrapEl(e, w - 4), [tx, anchor] = lineStart(e, x, w, 2, 'left'); g.append(textBlock(ls, tx, e.ph ? phTop(e, ls.length, st.size) : y + 4 + st.size * 0.95, st, ink, anchor)); }
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
    // A slide shows its real background in either theme; other frames follow the theme.
    g.append(s('rect', { x, y, width: w, height: h, rx: 12, fill: (e.slide ? e.fill : paintFill(e.fill, c.theme)) || c.frame, stroke: c.frameLine, 'stroke-width': 1, 'pointer-events': 'none' }));
    if (e.slide && c.foot) for (const p of c.foot(e)) { const n = renderEl(p, c); n.setAttribute('pointer-events', 'none'); g.append(n); }
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
    const brush = e.brush || 'pen', d = smoothPath(e.pts || [], x, y), sw = e.sw || (e.hl ? 16 : (BRUSHES[brush] || BRUSHES.pen).width);
    const col = e.hl ? (e.stroke || '#f5c518') : c.theme === 'dark' ? autoInkOr(e.stroke, c.ink) : e.stroke || c.ink;
    // Brush and pencil strokes are filled outlines shaped by pressure; the others are plain strokes.
    if (!e.hl && shaped(brush)) g.append(s('path', { d: outlineD(brushOutline(e.pts || [], sw, brush), x, y), fill: col, opacity: brush === 'pencil' ? 0.9 : null }));
    else g.append(s('path', { d, fill: 'none', stroke: col, 'stroke-width': sw, 'stroke-opacity': e.hl ? 0.4 : null, 'stroke-linecap': e.hl ? 'butt' : 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': e.hl ? null : dashOf(e, sw) }));
    if (!c.exp) g.append(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(14, sw + 8) }));
  } else if (e.type === 'path') {
    const { sx, sy } = scaleOf(e), d = pathD(e.paths || [], x, y, sx, sy), strokes = strokeLayers(e), sw = Math.max(2, ...strokes.map(l => l.width));
    if (e.masking) {
      // A mask is not drawn. On the board it shows as a faint dashed outline so it can still be found and picked.
      if (!c.exp) g.append(s('path', { d, fill: 'transparent', stroke: c.muted, 'stroke-width': 1, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke', 'stroke-opacity': 0.6 }));
    } else {
      const defs = s('defs'); let gi = 0;
      // Solid colors follow the theme like other board colors; gradients keep the colors chosen for them.
      const paint = (p: Paint, ink: string) => {
        if (!isGrad(p)) return !p ? ink : c.theme === 'dark' && INKISH.has(p.toLowerCase()) ? c.ink : paintFill(p, c.theme) || p;
        const id = `pg-${e.id}-${gi++}${c.exp ? '-x' : ''}`, stops = [...p.stops].sort((a, b) => a[0] - b[0]).map(([o, col]) => s('stop', { offset: o, 'stop-color': col }));
        defs.append(s(p.kind === 'radial' ? 'radialGradient' : 'linearGradient', { id, ...gradientGeom(p) }, stops));
        return `url(#${id})`;
      };
      const layers = [
        ...fillLayers(e).map(p => s('path', { d, fill: paint(p, c.ink), 'fill-rule': e.rule || null, stroke: 'none' })),
        // A width profile draws each stroke as a filled outline that narrows like a pen stroke.
        ...strokes.map(l => e.profile
          ? s('path', { d: profileD(e, l.width, x, y, sx, sy), fill: paint(l.paint, c.ink), stroke: 'none' })
          : s('path', { d, fill: 'none', stroke: paint(l.paint, c.ink), 'stroke-width': l.width, 'stroke-linecap': e.cap || 'round', 'stroke-linejoin': e.join || 'round', 'stroke-miterlimit': e.join === 'miter' ? 4 : null, 'stroke-dasharray': dashOf(e, l.width) })),
      ];
      if (gi) g.append(defs);
      g.append(...layers);
    }
    if (!c.exp) g.append(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(12, sw + 8) }));
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
    if (href) g.append(...pictureNodes(e, href, c));
    else g.append(s('rect', { x, y, width: w, height: h, rx: 6, fill: SURFACE[c.theme].head, stroke: c.frameLine, 'stroke-dasharray': '6 4' }),
      textBlock(['Loading picture'], x + w / 2, y + h / 2 + 4, { size: 13, weight: 500, family: st.family, italic: false }, c.muted, 'middle'));
  } else if (e.type === 'chart' && e.chart) {
    g.append(s('rect', { x, y, width: w, height: h, fill: 'transparent' }));
    const acc = c.accents ? c.accents() : ['#2e6fd8', '#f26b1d', '#2ea36f', '#8a5cd8', '#d83f6b', '#e3b21c'], fam = FONTS.sans.stack;
    const ink = { ink: c.ink, muted: c.muted, grid: SURFACE[c.theme].grid, surface: c.theme === 'dark' ? SURFACE.dark.card : '#ffffff' };
    const cg = s('g', { transform: `translate(${x} ${y})`, 'pointer-events': 'none' });
    for (const m of chartLayout(e.chart, w, h, acc, ink, (t, size) => measure(t, size, 400, fam))) {
      if (m.k === 'rect') cg.append(s('rect', { x: m.x, y: m.y, width: m.w, height: m.h, fill: m.fill }));
      else if (m.k === 'line') cg.append(s('line', { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, stroke: m.stroke, 'stroke-width': m.width, 'vector-effect': 'non-scaling-stroke' }));
      else if (m.k === 'path') cg.append(s('path', { d: m.d, fill: m.fill || 'none', stroke: m.stroke || 'none', 'stroke-width': m.width || 0, 'fill-opacity': m.opacity ?? null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      else if (m.k === 'dot') cg.append(s('circle', { cx: m.x, cy: m.y, r: m.r, fill: m.fill, stroke: m.stroke, 'stroke-width': 1.5 }));
      else if (!hide) { const t = s('text', { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, 'font-size': Math.round(m.size * 10) / 10, 'font-family': fam, 'font-weight': m.weight || 400, fill: m.fill, 'text-anchor': m.anchor }); t.textContent = m.text; cg.append(t); }
    }
    g.append(cg);
  } else if (e.type === 'table' && e.tstyle) {
    // A styled table (slides): flat cells painted from one accent, as PowerPoint's table styles.
    const rows = rowsOf(e), cols = Math.max(1, ...(e.cells || [['']]).map(r => r.length)), lines: SVGElement[] = [];
    g.append(s('rect', { x, y, width: w, height: h, fill: 'transparent' }));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const b = cellBox(e, r, k), look = cellLook(e, r, k), text = (e.cells?.[r]?.[k]) || '';
      if (look.fill) g.append(s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: look.fill, 'pointer-events': 'none' }));
      if (look.border) lines.push(s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: look.border[0], 'stroke-width': look.border[1], 'pointer-events': 'none' }));
      if (!text || (hide && c.editCell && c.editCell[0] === r && c.editCell[1] === k)) continue;
      const cs = look.bold ? { ...st, weight: Math.max(st.weight, 700) } : st, ink = look.text || (e.color ? e.color : inkOn(look.fill, undefined, look.fill ? 'light' : c.theme));
      const ls = wrapEl({ ...e, text, weight: cs.weight }, b.w - 16).slice(0, Math.max(1, Math.floor((b.h - 8) / lh)));
      lines.push(textBlock(ls, b.x + 8, b.y + b.h / 2 - ls.length * lh / 2 + cs.size * 0.97, cs, ink));
    }
    g.append(...lines);
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
  // A masked piece is clipped to its mask's outline. The clip lives in this piece's own (turned) space,
  // so the outline is turned back by the piece's rotation.
  const m = e.mask && c.get ? c.get(e.mask) : undefined;
  if (m && m.masking) {
    const id = `mk-${e.id}${c.exp ? '-x' : ''}`;
    g.prepend(s('clipPath', { id }, s('path', { d: pathD(outlineOf(m)), 'clip-rule': m.rule || null, transform: e.rot && e.type !== 'conn' ? `rotate(${-e.rot} ${x + w / 2} ${y + h / 2})` : null })));
    g.setAttribute('clip-path', `url(#${id})`);
  }
  return g;
}
