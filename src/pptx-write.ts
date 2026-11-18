/**
 * Export as PowerPoint: the slides on a page become a .pptx file that opens and edits in PowerPoint,
 * Keynote, and Google Slides. Shapes keep their preset geometry and adjust values, text keeps its
 * paragraphs, levels, and bullets, pictures their crop, tables their colors, and charts their data
 * (as literal values, so the chart draws without an embedded workbook). The deck theme becomes the
 * file's theme. Coordinates are px at 96 per inch: 9525 EMU each.
 */
import { isRadar, isScatter, seriesColors, xValues, type ChartData } from './chart';
import { connGeom } from './connectors';
import { pageTheme, themeById, type DeckTheme } from './deck';
import { textStyle } from './geometry';
import { fromD, worldPaths, type SubPath } from './vector';
import { levelRatio, markers, parasOf, indentOf } from './richtext';
import { spansOf, type Run, type RunStyle } from './runs';
import { slideMembers, slidesOf } from './slides';
import { cellBox, cellLook, colFractions, rowsOf } from './table';
import { FONTS, type El, type Lookup } from './types';
import { inkOn } from './palette';
import { x, XML_HEAD } from './xml';
import { zip } from './zip';

export interface PptxImage { bytes: Uint8Array; ext: 'png' | 'jpeg' | 'gif' }
export interface WriteOpts {
  /** Picture bytes for a picture source id. */
  image: (src: string) => PptxImage | undefined;
  /** The date footers show. */
  today: string;
  title?: string;
}

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
};
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
const EMU = 9525;
const emu = (px: number) => Math.round(px * EMU);
/** Hundredths of a point for a size in px. */
const hpt = (px: number) => Math.max(100, Math.round(px * 75));

/* ---------- Colors and lines ---------- */

/** A color as DrawingML: hex without #, upper case, with alpha for 8-digit colors. */
function clr(hex: string | undefined): string | null {
  if (!hex || typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  return x('a:srgbClr', { val: m[1].toUpperCase() }, m[2] ? x('a:alpha', { val: Math.round(parseInt(m[2], 16) / 255 * 100000) }) : '');
}
const solid = (hex: string | undefined) => { const c = clr(hex); return c ? x('a:solidFill', {}, c) : x('a:noFill'); };
const HEAD: Record<string, string> = { arrow: 'arrow', triangle: 'triangle', circle: 'oval', bar: 'diamond', none: 'none' };
function line(color: string | undefined, px: number, e?: El, ends?: { head?: string; tail?: string }): string {
  if (!color || color === 'none' || px <= 0) return x('a:ln', {}, x('a:noFill'));
  return x('a:ln', { w: emu(px * 1) },
    solid(color),
    e && e.dash ? x('a:prstDash', { val: e.dash === 'dot' ? 'sysDot' : 'dash' }) : '',
    x('a:round'),
    ends && ends.tail && ends.tail !== 'none' ? x('a:headEnd', { type: HEAD[ends.tail] || 'triangle' }) : '',
    ends && ends.head && ends.head !== 'none' ? x('a:tailEnd', { type: HEAD[ends.head] || 'triangle' }) : '');
}

/* ---------- Text ---------- */

/** The typeface for a JAM font: theme fonts for linked pieces and the default, named fonts otherwise. */
function face(e: El): string {
  if (e.tc && e.tc.font === 'major') return '+mj-lt';
  const key = e.font || 'sans';
  if (key === 'sans' || (e.tc && e.tc.font === 'minor')) return '+mn-lt';
  const names: Record<string, string> = { serif: 'Georgia', round: 'Arial Rounded MT Bold', narrow: 'Arial Narrow', hand: 'Segoe Print', mono: 'Consolas', type: 'Courier New' };
  return names[key] || (FONTS[key] ? '+mn-lt' : key);
}
const NUM = ['arabicPeriod', 'alphaLcPeriod', 'romanLcPeriod'];

/**
 * A text body: one paragraph per line, with level, bullet or number, spacing, and run style. `inset`
 * is the padding in px; `anchor` is t, ctr, or b; `align` defaults per piece kind.
 */
function txBody(e: El, text: string | undefined, o: { inset: [number, number]; anchor: string; align?: string; color?: string; size?: number; bold?: boolean; autofit?: boolean; tag?: string; runs?: Run[] | null }): string {
  const st = textStyle(e), base = o.size || st.size, ps = parasOf(text), marks = markers(ps, e.bullets), tag = o.tag || 'p:txBody';
  const algn = { left: 'l', center: 'ctr', right: 'r' }[(e.align as string) || o.align || 'left'] || 'l';
  const count: number[] = [], runs = o.runs !== undefined ? (o.runs && o.runs.length ? o.runs : null) : text === e.text && e.runs && e.runs.length ? e.runs : null;
  let off = 0;
  const paras = ps.map((p, i) => {
    const start = off + p.level; off += p.level + p.text.length + 1;
    const size = base * levelRatio(e, p.level), ind = indentOf(p.level, base, e.bullets);
    count.length = p.level + 1; count[p.level] = (count[p.level] || 0) + 1;
    const bullet = e.bullets === 'disc' ? x('a:buFont', { typeface: 'Arial' }) + x('a:buChar', { char: marks[i] || '•' })
      : e.bullets === 'num' ? x('a:buFont', { typeface: '+mj-lt' }) + x('a:buAutoNum', { type: NUM[p.level % 3] }) : x('a:buNone');
    const pPr = x('a:pPr', { lvl: p.level || undefined, marL: emu(ind.text), indent: e.bullets ? -emu(ind.text - ind.marker) : 0, algn },
      e.lsp ? x('a:lnSpc', {}, x('a:spcPct', { val: Math.round(e.lsp * 100000) })) : '',
      i && e.psp != null ? x('a:spcBef', {}, x('a:spcPts', { val: Math.round(e.psp * 75) })) : '',
      bullet);
    // Each styled stretch of the paragraph is its own run, with its overrides on top of the piece's style.
    const rPr = (t: string, r: RunStyle = {}) => {
      const bold = r.w ? r.w >= 600 : !!o.bold || st.weight >= 600, ital = r.i != null ? r.i : st.italic, fc = r.f ? face({ ...e, font: r.f, tc: undefined }) : face(e);
      return x(t, { lang: 'en-US', sz: hpt(r.z || size), b: bold ? 1 : r.w ? 0 : undefined, i: ital ? 1 : r.i === false ? 0 : undefined, u: r.u ? 'sng' : undefined, strike: r.x ? 'sngStrike' : undefined, dirty: 0 },
        solid(r.c || o.color || e.color || '#1d2530'), x('a:latin', { typeface: fc }), x('a:cs', { typeface: fc }));
    };
    const body = !p.text ? '' : runs ? spansOf(runs, start, start + p.text.length).map(sp => x('a:r', {}, rPr('a:rPr', sp.st), x('a:t', {}, esc(p.text.slice(sp.s - start, sp.e - start))))).join('')
      : x('a:r', {}, rPr('a:rPr'), x('a:t', {}, esc(p.text)));
    return x('a:p', {}, pPr, body, rPr('a:endParaRPr'));
  });
  return x(tag, {},
    x('a:bodyPr', { wrap: 'square', lIns: emu(o.inset[0]), tIns: emu(o.inset[1]), rIns: emu(o.inset[0]), bIns: emu(o.inset[1]), rtlCol: 0, anchor: o.anchor }, o.autofit ? x('a:normAutofit') : x('a:noAutofit')),
    x('a:lstStyle'), ...paras);
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/* ---------- Geometry ---------- */

/** A custom geometry from subpaths in board units, relative to a box. */
function custGeom(subs: SubPath[], box: { x: number; y: number; w: number; h: number }, filled: boolean): string {
  const P = (px: number, py: number) => x('a:pt', { x: emu(px - box.x), y: emu(py - box.y) });
  const body = subs.map(sp => {
    if (!sp.nodes.length) return '';
    const n = sp.nodes, cmds = [x('a:moveTo', {}, P(n[0].x, n[0].y))];
    const seg = (a: typeof n[0], b: typeof n[0]) => {
      const c1x = a.ox ?? a.x, c1y = a.oy ?? a.y, c2x = b.ix ?? b.x, c2y = b.iy ?? b.y;
      if (c1x === a.x && c1y === a.y && c2x === b.x && c2y === b.y) cmds.push(x('a:lnTo', {}, P(b.x, b.y)));
      else cmds.push(x('a:cubicBezTo', {}, P(c1x, c1y), P(c2x, c2y), P(b.x, b.y)));
    };
    for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
    if (sp.closed) { seg(n[n.length - 1], n[0]); cmds.push(x('a:close')); }
    return cmds.join('');
  }).join('');
  return x('a:custGeom', {}, x('a:avLst'), x('a:gdLst'), x('a:ahLst'), x('a:cxnLst'), x('a:rect', { l: 0, t: 0, r: 'r', b: 'b' }),
    x('a:pathLst', {}, x('a:path', { w: emu(box.w), h: emu(box.h), fill: filled ? undefined : 'none' }, body)));
}
const xfrm = (b: { x: number; y: number; w: number; h: number }, o: { x: number; y: number }, rot?: number, tag = 'a:xfrm') =>
  x(tag, { rot: rot ? Math.round(rot * 60000) : undefined }, x('a:off', { x: emu(b.x - o.x), y: emu(b.y - o.y) }), x('a:ext', { cx: Math.max(1, emu(b.w)), cy: Math.max(1, emu(b.h)) }));

/* ---------- Parts per slide ---------- */

interface SlideOut { xml: string; rels: string[]; media: [string, Uint8Array][]; charts: [string, string][]; notes?: string }

let mediaN = 0, chartN = 0;

/** One slide's XML and its parts. */
function slidePart(f: El, els: Record<string, El>, get: Lookup, th: DeckTheme, o: WriteOpts, n: number): SlideOut {
  const rels: string[] = [x('Relationship', { Id: 'rId1', Type: `${REL}/slideLayout`, Target: '../slideLayouts/slideLayout1.xml' })];
  const media: [string, Uint8Array][] = [], charts: [string, string][] = [];
  let id = 2, rid = 2;
  const name = (e: El) => `${e.type} ${e.id}`;
  const nv = (tag: string, e: El, inner: string) => x(`p:nv${tag}Pr`, {}, x('p:cNvPr', { id: id++, name: name(e) }), inner, x('p:nvPr'));
  const shapes: string[] = [];
  const members = slideMembers(els, f, get).filter(e => !e.boolIn && e.id !== f.id);

  for (const e of members) {
    if (e.type === 'text') {
      if (!e.text || !e.text.trim() || e.ph === 'picture') continue;
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr', { txBox: 1 })),
        x('p:spPr', {}, xfrm(e, f, e.rot), x('a:prstGeom', { prst: 'rect' }, x('a:avLst')), x('a:noFill')),
        txBody(e, e.text, { inset: [2, 4], anchor: e.va === 'bottom' ? 'b' : e.va === 'middle' ? 'ctr' : 't', autofit: !!e.ph })));
    } else if (e.type === 'image') {
      const img = e.src ? o.image(e.src) : undefined;
      if (!img) continue;
      const file = `image${++mediaN}.${img.ext === 'jpeg' ? 'jpeg' : img.ext}`, r = `rId${rid++}`;
      media.push([file, img.bytes]);
      rels.push(x('Relationship', { Id: r, Type: `${REL}/image`, Target: `../media/${file}` }));
      const [l, t, rr, b] = e.crop || [0, 0, 0, 0], k = 100000;
      const geom = e.oval ? x('a:prstGeom', { prst: 'ellipse' }, x('a:avLst')) : e.rad ? x('a:prstGeom', { prst: 'roundRect' }, x('a:avLst', {}, x('a:gd', { name: 'adj', fmla: `val ${Math.round(Math.min(50000, e.rad / Math.min(e.w, e.h) * 100000))}` }))) : x('a:prstGeom', { prst: 'rect' }, x('a:avLst'));
      shapes.push(x('p:pic', {}, nv('Pic', e, x('p:cNvPicPr', {}, x('a:picLocks', { noChangeAspect: 1 }))),
        x('p:blipFill', {}, x('a:blip', { 'r:embed': r }), e.crop ? x('a:srcRect', { l: Math.round(l * k), t: Math.round(t * k), r: Math.round(rr * k), b: Math.round(b * k) }) : '', x('a:stretch', {}, x('a:fillRect'))),
        x('p:spPr', {}, xfrm(e, f, e.rot), geom, e.stroke && e.sw ? line(e.stroke, e.sw) : '')));
    } else if (e.type === 'table') {
      const rows = rowsOf(e), fr = colFractions(e), cols = fr.length;
      const grid = x('a:tblGrid', {}, ...fr.map(c => x('a:gridCol', { w: emu(c * e.w) })));
      const trs = Array.from({ length: rows }, (_, r) => x('a:tr', { h: emu(cellBox(e, r, 0).h) }, ...Array.from({ length: cols }, (_, c) => {
        const look = e.tstyle ? cellLook(e, r, c) : { fill: r === 0 && e.header ? '#f3f5f8' : '#ffffff', bold: r === 0 && !!e.header, border: ['#dde2ea', 1] as [string, number] };
        const ln = (t: string) => look.border ? x(t, { w: emu(look.border[1]) }, solid(look.border[0])) : x(t, {}, x('a:noFill'));
        return x('a:tc', {}, txBody(e, (e.cells?.[r]?.[c]) || '', { inset: [8, 4], anchor: 'ctr', color: look.text || e.color, bold: look.bold, tag: 'a:txBody', runs: e.cruns?.[r]?.[c] || null }),
          x('a:tcPr', { anchor: 'ctr' }, ln('a:lnL'), ln('a:lnR'), ln('a:lnT'), ln('a:lnB'), solid(look.fill)));
      })));
      shapes.push(x('p:graphicFrame', {}, nv('GraphicFrame', e, x('p:cNvGraphicFramePr', {}, x('a:graphicFrameLocks', { noGrp: 1 }))),
        xfrm(e, f, undefined, 'p:xfrm'),
        x('a:graphic', {}, x('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/table' },
          x('a:tbl', {}, x('a:tblPr', { firstRow: e.header ? 1 : undefined, bandRow: e.band ? 1 : undefined, firstCol: e.firstCol ? 1 : undefined, lastRow: e.lastRow ? 1 : undefined }), grid, ...trs)))));
    } else if (e.type === 'chart' && e.chart) {
      const file = `chart${++chartN}.xml`, r = `rId${rid++}`;
      charts.push([file, chartPart(e.chart, th)]);
      rels.push(x('Relationship', { Id: r, Type: `${REL}/chart`, Target: `../charts/${file}` }));
      shapes.push(x('p:graphicFrame', {}, nv('GraphicFrame', e, x('p:cNvGraphicFramePr')), xfrm(e, f, undefined, 'p:xfrm'),
        x('a:graphic', {}, x('a:graphicData', { uri: NS.c }, x('c:chart', { 'xmlns:c': NS.c, 'xmlns:r': NS.r, 'r:id': r })))));
    } else if (e.type === 'conn') {
      const g = connGeom(e, get), subs = fromD(g.d);
      const xs = g.pts.map(p => p.x), ys = g.pts.map(p => p.y), bx = Math.min(...xs), by = Math.min(...ys);
      const box = { x: bx, y: by, w: Math.max(1, Math.max(...xs) - bx), h: Math.max(1, Math.max(...ys) - by) };
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr')),
        x('p:spPr', {}, xfrm(box, f), custGeom(subs, box, false), x('a:noFill'), line(e.stroke || '#5d697c', e.sw || 2, e, { head: e.head || 'triangle', tail: e.tail })),
        e.text ? txBody(e, e.text, { inset: [4, 2], anchor: 'ctr', align: 'center' }) : ''));
    } else if (e.type === 'pen') {
      const pts = e.pts || [];
      if (pts.length < 2) continue;
      const sp: SubPath = { nodes: pts.map(p => ({ x: e.x + p[0], y: e.y + p[1] })) };
      const xs = sp.nodes.map(p => p.x), ys = sp.nodes.map(p => p.y), bx = Math.min(...xs), by = Math.min(...ys);
      const box = { x: bx, y: by, w: Math.max(1, Math.max(...xs) - bx), h: Math.max(1, Math.max(...ys) - by) };
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr')), x('p:spPr', {}, xfrm(box, f), custGeom([sp], box, false), x('a:noFill'), line(e.stroke || '#1d2530', e.sw || (e.hl ? 16 : 3), e))));
    } else if (e.type === 'path') {
      const subs = worldPaths(e), fill = typeof e.fill === 'string' ? e.fill : undefined;
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr')),
        x('p:spPr', {}, xfrm(e, f, e.rot), custGeom(subs.map(sp => ({ ...sp, nodes: sp.nodes.map(nn => ({ ...nn })) })), e, true), solid(fill && fill !== 'none' ? fill : undefined), line(e.stroke, e.sw || (e.stroke ? 1 : 0), e))));
    } else if (e.type === 'frame') {
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr')), x('p:spPr', {}, xfrm(e, f), x('a:prstGeom', { prst: 'rect' }, x('a:avLst')), solid(e.fill), line('#d9dee5', 1))));
    } else {
      // Shapes and everything shaped like a box: rectangles, ellipses, diamonds, presets, stickies, cards, stickers, tape.
      const prst = e.type === 'rect' ? (e.preset || 'roundRect') : e.type === 'ellipse' ? 'ellipse' : e.type === 'diamond' ? 'diamond' : e.type === 'sticker' ? 'star5' : 'rect';
      const av = e.type === 'rect' && !e.preset ? [x('a:gd', { name: 'adj', fmla: `val ${Math.round(Math.min(50000, Math.min(10, e.w / 4, e.h / 4) / Math.min(e.w, e.h) * 100000))}` })]
        : Object.entries(e.adj || {}).map(([k, v]) => x('a:gd', { name: k, fmla: `val ${Math.round(v)}` }));
      const fill = e.type === 'sticky' ? (e.fill || '#fde68a') : e.type === 'card' ? '#ffffff' : e.fill || (e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond' ? '#ffffff' : '#f6b8c8');
      const stroke = e.type === 'sticky' || e.type === 'sticker' || e.type === 'tape' ? undefined : e.stroke === 'none' ? undefined : (e.stroke || '#2b3545');
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr')),
        x('p:spPr', {}, xfrm(e, f, e.rot), x('a:prstGeom', { prst }, x('a:avLst', {}, ...av)), solid(fill), line(stroke, e.sw ?? 1.5, e)),
        txBody(e, e.text || '', { inset: [8, 6], anchor: e.type === 'sticky' || e.type === 'card' ? 't' : 'ctr', align: e.type === 'sticky' || e.type === 'card' ? 'left' : 'center', color: inkOn(fill, e.color, 'light') })));
    }
  }

  // Footers, drawn as text boxes.
  const ft = f.foot;
  if (ft) {
    const k = Math.min(f.w / 960, f.h / 540), size = 12 * k, ink = '#6b6b6b';
    const add = (text: string, bx: number, bw: number, align: 'left' | 'center' | 'right') => {
      const e: El = { id: `foot${id}`, type: 'text', z: 0, x: f.x + bx * f.w / 960, y: f.y + 500 * f.h / 540, w: bw * f.w / 960, h: 28 * f.h / 540, text, size, align, color: ink };
      shapes.push(x('p:sp', {}, nv('Sp', e, x('p:cNvSpPr', { txBox: 1 })), x('p:spPr', {}, xfrm(e, f), x('a:prstGeom', { prst: 'rect' }, x('a:avLst')), x('a:noFill')), txBody(e, text, { inset: [2, 2], anchor: 'ctr' })));
    };
    if (ft.date) add(o.today, 60, 216, 'left');
    if (ft.text) add(ft.text, 318, 324, 'center');
    if (ft.num) add(String(n), 684, 216, 'right');
  }

  const bg = clr(f.fill) ? x('p:bg', {}, x('p:bgPr', {}, solid(f.fill), x('a:effectLst'))) : '';
  const xml = XML_HEAD + x('p:sld', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p },
    x('p:cSld', { name: f.text || undefined }, bg,
      x('p:spTree', {},
        x('p:nvGrpSpPr', {}, x('p:cNvPr', { id: 1, name: '' }), x('p:cNvGrpSpPr'), x('p:nvPr')),
        x('p:grpSpPr', {}, x('a:xfrm', {}, x('a:off', { x: 0, y: 0 }), x('a:ext', { cx: 0, cy: 0 }), x('a:chOff', { x: 0, y: 0 }), x('a:chExt', { cx: 0, cy: 0 }))),
        ...shapes)),
    x('p:clrMapOvr', {}, x('a:masterClrMapping')));
  return { xml, rels, media, charts, notes: f.notes && f.notes.trim() ? f.notes : undefined };
}

/* ---------- Charts ---------- */

/** A chart part with its data written in as literal values. */
export function chartPart(c: ChartData, th: DeckTheme): string {
  const accents = [th.colors.accent1, th.colors.accent2, th.colors.accent3, th.colors.accent4, th.colors.accent5, th.colors.accent6];
  const colors = seriesColors(c, accents), pie = c.kind === 'pie' || c.kind === 'doughnut', xy = isScatter(c.kind), radar = isRadar(c.kind), combo = c.kind === 'combo' && c.series.length > 1;
  const strLit = (vals: string[]) => x('c:strLit', {}, x('c:ptCount', { val: vals.length }), ...vals.map((v, i) => x('c:pt', { idx: i }, x('c:v', {}, esc(v)))));
  const numLit = (vals: number[]) => x('c:numLit', {}, x('c:formatCode', {}, 'General'), x('c:ptCount', { val: vals.length }), ...vals.map((v, i) => x('c:pt', { idx: i }, x('c:v', {}, String(v || 0)))));
  const sp = (hex: string, lineOnly = false) => x('c:spPr', {}, lineOnly ? x('a:ln', { w: 28575, cap: 'rnd' }, solid(hex), x('a:round')) : solid(hex));
  const dl = (show: boolean, pct = false) => x('c:dLbls', {}, x('c:showLegendKey', { val: 0 }), x('c:showVal', { val: show && !pct ? 1 : 0 }), x('c:showCatName', { val: 0 }), x('c:showSerName', { val: 0 }), x('c:showPercent', { val: show && pct ? 1 : 0 }), x('c:showBubbleSize', { val: 0 }));
  const marker = (i: number, on: boolean) => x('c:marker', {}, x('c:symbol', { val: on ? 'circle' : 'none' }), on ? x('c:size', { val: 6 }) : '', on ? sp(colors[i]) : '');
  type Kind = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar';
  const one = (s: ChartData['series'][number], i: number, kind: Kind) => x('c:ser', {},
    x('c:idx', { val: i }), x('c:order', { val: i }), x('c:tx', {}, x('c:v', {}, esc(s.name))),
    kind === 'pie' ? '' : kind === 'scatter' && c.kind === 'scatter' ? x('c:spPr', {}, x('a:ln', { w: 28575 }, x('a:noFill')))
      : kind === 'radar' && c.kind === 'radarFilled' ? x('c:spPr', {}, x('a:solidFill', {}, x('a:srgbClr', { val: colors[i].slice(1, 7).toUpperCase() }, x('a:alpha', { val: 35000 }))), x('a:ln', { w: 19050 }, solid(colors[i])))
      : sp(colors[i], kind === 'line' || kind === 'scatter' || kind === 'radar'),
    kind === 'bar' ? x('c:invertIfNegative', { val: 0 }) : '',
    kind === 'line' ? marker(i, c.kind === 'lineMarkers' || combo) : kind === 'scatter' ? marker(i, true) : kind === 'radar' ? marker(i, c.kind === 'radar') : '',
    kind === 'pie' ? c.cats.map((_, k) => x('c:dPt', {}, x('c:idx', { val: k }), x('c:bubble3D', { val: 0 }), x('c:spPr', {}, solid(colors[k]), x('a:ln', { w: 19050 }, solid('#FFFFFF'))))).join('') : '',
    kind === 'scatter' ? x('c:xVal', {}, numLit(xValues(c))) + x('c:yVal', {}, numLit(s.vals)) : x('c:cat', {}, strLit(c.cats)) + x('c:val', {}, numLit(s.vals)),
    kind === 'line' || kind === 'scatter' ? x('c:smooth', { val: 0 }) : '');
  const series = (kind: Kind, list = c.series.map((s, i) => [s, i] as const)) => list.slice(0, pie ? 1 : undefined).map(([s, i]) => one(s, i, kind)).join('');
  const grouping = c.kind.startsWith('percent') ? 'percentStacked' : c.kind.startsWith('stacked') ? 'stacked' : c.kind.startsWith('line') || c.kind === 'area' ? 'standard' : 'clustered';
  const horiz = c.kind.toLowerCase().includes('bar');
  const axes = x('c:axId', { val: 111 }) + x('c:axId', { val: 222 });
  const barPlot = (list?: (readonly [ChartData['series'][number], number])[]) => x('c:barChart', {}, x('c:barDir', { val: horiz ? 'bar' : 'col' }), x('c:grouping', { val: combo ? 'clustered' : grouping }), x('c:varyColors', { val: 0 }), series('bar', list), dl(!!c.labels),
    x('c:gapWidth', { val: 80 }), !combo && grouping !== 'clustered' ? x('c:overlap', { val: 100 }) : x('c:overlap', { val: -10 }), axes);
  let plot: string;
  if (pie) plot = x(c.kind === 'pie' ? 'c:pieChart' : 'c:doughnutChart', {}, x('c:varyColors', { val: 1 }), series('pie'), dl(c.labels !== false, true), x('c:firstSliceAng', { val: 0 }), c.kind === 'doughnut' ? x('c:holeSize', { val: 55 }) : '');
  else if (xy) plot = x('c:scatterChart', {}, x('c:scatterStyle', { val: 'lineMarker' }), x('c:varyColors', { val: 0 }), series('scatter'), dl(!!c.labels), axes);
  else if (radar) plot = x('c:radarChart', {}, x('c:radarStyle', { val: c.kind === 'radarFilled' ? 'filled' : 'marker' }), x('c:varyColors', { val: 0 }), series('radar'), dl(!!c.labels), axes);
  else if (combo) {
    const pairs = c.series.map((s, i) => [s, i] as const);
    plot = barPlot(pairs.slice(0, -1)) + x('c:lineChart', {}, x('c:grouping', { val: 'standard' }), x('c:varyColors', { val: 0 }), series('line', pairs.slice(-1)), dl(!!c.labels), x('c:marker', { val: 1 }), axes);
  }
  else if (c.kind.startsWith('line')) plot = x('c:lineChart', {}, x('c:grouping', { val: 'standard' }), x('c:varyColors', { val: 0 }), series('line'), dl(!!c.labels), x('c:marker', { val: 1 }), axes);
  else if (c.kind.endsWith('rea')) plot = x('c:areaChart', {}, x('c:grouping', { val: c.kind === 'stackedArea' ? 'stacked' : 'standard' }), x('c:varyColors', { val: 0 }), series('area'), dl(!!c.labels), axes);
  else plot = barPlot();
  const txPr = (sz: number) => x('c:txPr', {}, x('a:bodyPr'), x('a:lstStyle'), x('a:p', {}, x('a:pPr', {}, x('a:defRPr', { sz }, solid('#5D697C'))), x('a:endParaRPr', { lang: 'en-US' })));
  // Axis titles go on the axis at that edge: the bottom one carries the horizontal title, the left one the vertical.
  const axTitle = (text: string | undefined, upright: boolean) => !text || pie || radar ? '' : x('c:title', {}, x('c:tx', {}, x('c:rich', {}, x('a:bodyPr', upright ? { rot: -5400000, vert: 'horz' } : {}), x('a:lstStyle'),
    x('a:p', {}, x('a:pPr', {}, x('a:defRPr', { sz: 1200, b: 1 })), x('a:r', {}, x('a:rPr', { lang: 'en-US', sz: 1200, b: 1 }, solid('#5D697C')), x('a:t', {}, esc(text)))))), x('c:overlay', { val: 0 }));
  const titleAt = (pos: string) => pos === 'b' ? axTitle(c.xTitle, false) : axTitle(c.yTitle, true);
  const ticks = [x('c:majorTickMark', { val: 'none' }), x('c:minorTickMark', { val: 'none' }), x('c:tickLblPos', { val: 'nextTo' })].join('');
  const gridOf = () => c.grid !== false ? x('c:majorGridlines', {}, x('c:spPr', {}, x('a:ln', { w: 9525 }, solid('#E3E7EE')))) : '';
  const catPos = horiz ? 'l' : 'b', valPos = horiz ? 'b' : 'l';
  const catAx = x('c:catAx', {}, x('c:axId', { val: 111 }), x('c:scaling', {}, x('c:orientation', { val: horiz ? 'maxMin' : 'minMax' })), x('c:delete', { val: 0 }), x('c:axPos', { val: catPos }), radar ? gridOf() : '', titleAt(catPos),
    x('c:numFmt', { formatCode: 'General', sourceLinked: 0 }), ticks,
    x('c:spPr', {}, x('a:ln', { w: 9525 }, solid('#8C96A3'))), txPr(1200), x('c:crossAx', { val: 222 }), x('c:crosses', { val: 'autoZero' }), x('c:auto', { val: 1 }), x('c:lblAlgn', { val: 'ctr' }), x('c:lblOffset', { val: 100 }), x('c:noMultiLvlLbl', { val: 0 }));
  const valAx = (id: number, cross: number, pos: string, line = false) => x('c:valAx', {}, x('c:axId', { val: id }), x('c:scaling', {}, x('c:orientation', { val: 'minMax' })), x('c:delete', { val: 0 }), x('c:axPos', { val: pos }),
    gridOf(), titleAt(pos),
    x('c:numFmt', { formatCode: grouping === 'percentStacked' ? '0%' : 'General', sourceLinked: 0 }), ticks,
    x('c:spPr', {}, line ? x('a:ln', { w: 9525 }, solid('#8C96A3')) : x('a:ln', {}, x('a:noFill'))), txPr(1200), x('c:crossAx', { val: cross }), x('c:crosses', { val: 'autoZero' }), x('c:crossBetween', { val: c.kind.endsWith('rea') || xy ? 'midCat' : 'between' }));
  const axesXml = pie ? '' : xy ? valAx(111, 222, 'b', true) + valAx(222, 111, 'l') : catAx + valAx(222, 111, valPos);
  const title = c.title ? x('c:title', {}, x('c:tx', {}, x('c:rich', {}, x('a:bodyPr'), x('a:lstStyle'), x('a:p', {}, x('a:pPr', {}, x('a:defRPr', { sz: 1600, b: 1 })), x('a:r', {}, x('a:rPr', { lang: 'en-US', sz: 1600, b: 1 }), x('a:t', {}, esc(c.title)))))), x('c:overlay', { val: 0 })) : '';
  const legend = c.legend === 'none' ? '' : x('c:legend', {}, x('c:legendPos', { val: c.legend === 'right' ? 'r' : 'b' }), x('c:overlay', { val: 0 }), txPr(1200));
  return XML_HEAD + x('c:chartSpace', { 'xmlns:c': NS.c, 'xmlns:a': NS.a, 'xmlns:r': NS.r },
    x('c:roundedCorners', { val: 0 }),
    x('c:chart', {}, title, x('c:autoTitleDeleted', { val: c.title ? 0 : 1 }), x('c:plotArea', {}, x('c:layout'), plot, axesXml), legend, x('c:plotVisOnly', { val: 1 }), x('c:dispBlanksAs', { val: 'gap' })),
    x('c:txPr', {}, x('a:bodyPr'), x('a:lstStyle'), x('a:p', {}, x('a:pPr', {}, x('a:defRPr', { sz: 1200 }, x('a:latin', { typeface: '+mn-lt' }))), x('a:endParaRPr', { lang: 'en-US' }))));
}

/* ---------- Package parts ---------- */

/** The theme part: the deck theme's twelve colors and two fonts, with a plain format scheme. */
export function themePart(th: DeckTheme, name = 'JAM'): string {
  const c = th.colors, sc = (tag: string, hex: string) => x(`a:${tag}`, {}, x('a:srgbClr', { val: hex.replace('#', '').toUpperCase() }));
  const fill = (lum?: number) => x('a:solidFill', {}, x('a:schemeClr', { val: 'phClr' }, lum ? x('a:lumMod', { val: lum }) : ''));
  const ln = (w: number) => x('a:ln', { w, cap: 'flat', cmpd: 'sng', algn: 'ctr' }, x('a:solidFill', {}, x('a:schemeClr', { val: 'phClr' })), x('a:prstDash', { val: 'solid' }), x('a:miter', { lim: 800000 }));
  return XML_HEAD + x('a:theme', { 'xmlns:a': NS.a, name },
    x('a:themeElements', {},
      x('a:clrScheme', { name: th.name }, sc('dk1', c.dk1), sc('lt1', c.lt1), sc('dk2', c.dk2), sc('lt2', c.lt2), sc('accent1', c.accent1), sc('accent2', c.accent2), sc('accent3', c.accent3),
        sc('accent4', c.accent4), sc('accent5', c.accent5), sc('accent6', c.accent6), sc('hlink', c.hlink), sc('folHlink', c.folHlink)),
      x('a:fontScheme', { name: th.name },
        x('a:majorFont', {}, x('a:latin', { typeface: th.major }), x('a:ea', { typeface: '' }), x('a:cs', { typeface: '' })),
        x('a:minorFont', {}, x('a:latin', { typeface: th.minor }), x('a:ea', { typeface: '' }), x('a:cs', { typeface: '' }))),
      x('a:fmtScheme', { name: th.name },
        x('a:fillStyleLst', {}, fill(), fill(90000), fill(75000)),
        x('a:lnStyleLst', {}, ln(6350), ln(12700), ln(19050)),
        x('a:effectStyleLst', {}, x('a:effectStyle', {}, x('a:effectLst')), x('a:effectStyle', {}, x('a:effectLst')), x('a:effectStyle', {}, x('a:effectLst'))),
        x('a:bgFillStyleLst', {}, fill(), fill(95000), fill(85000)))),
    x('a:objectDefaults'), x('a:extraClrSchemeLst'));
}

const CLRMAP = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };
const emptyTree = x('p:spTree', {}, x('p:nvGrpSpPr', {}, x('p:cNvPr', { id: 1, name: '' }), x('p:cNvGrpSpPr'), x('p:nvPr')),
  x('p:grpSpPr', {}, x('a:xfrm', {}, x('a:off', { x: 0, y: 0 }), x('a:ext', { cx: 0, cy: 0 }), x('a:chOff', { x: 0, y: 0 }), x('a:chExt', { cx: 0, cy: 0 }))));
const rels = (items: string[]) => XML_HEAD + x('Relationships', { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' }, ...items);

/** A notes page: the slide's presenter notes in the body placeholder. */
function notesPart(notes: string): string {
  const paras = notes.split('\n').map(l => x('a:p', {}, l ? x('a:r', {}, x('a:rPr', { lang: 'en-US', dirty: 0 }), x('a:t', {}, esc(l))) : '', x('a:endParaRPr', { lang: 'en-US' })));
  return XML_HEAD + x('p:notes', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p },
    x('p:cSld', {}, x('p:spTree', {}, x('p:nvGrpSpPr', {}, x('p:cNvPr', { id: 1, name: '' }), x('p:cNvGrpSpPr'), x('p:nvPr')),
      x('p:grpSpPr', {}, x('a:xfrm', {}, x('a:off', { x: 0, y: 0 }), x('a:ext', { cx: 0, cy: 0 }), x('a:chOff', { x: 0, y: 0 }), x('a:chExt', { cx: 0, cy: 0 }))),
      x('p:sp', {}, x('p:nvSpPr', {}, x('p:cNvPr', { id: 2, name: 'Notes' }), x('p:cNvSpPr', {}, x('a:spLocks', { noGrp: 1 })), x('p:nvPr', {}, x('p:ph', { type: 'body', idx: 1 }))),
        x('p:spPr', {}, x('a:xfrm', {}, x('a:off', { x: 685800, y: 4400550 }), x('a:ext', { cx: 5486400, cy: 3600450 }))),
        x('p:txBody', {}, x('a:bodyPr'), x('a:lstStyle'), ...paras)))),
    x('p:clrMapOvr', {}, x('a:masterClrMapping')));
}

/** Writes the page's slides as a .pptx file. */
export async function writePptx(els: Record<string, El>, get: Lookup, o: WriteOpts): Promise<Uint8Array> {
  const slides = slidesOf(els);
  if (!slides.length) throw new Error('There are no slides on this page.');
  mediaN = 0; chartN = 0;
  const th = pageTheme(els) || themeById();
  const W = slides[0].w, H = slides[0].h;
  const outs = slides.map((f, i) => slidePart(f, els, get, th, o, i + 1));
  const files: [string, Uint8Array | string][] = [];
  const over: string[] = [];
  const ov = (part: string, type: string) => over.push(x('Override', { PartName: part, ContentType: type }));

  const presRels = [x('Relationship', { Id: 'rId1', Type: `${REL}/slideMaster`, Target: 'slideMasters/slideMaster1.xml' }), x('Relationship', { Id: 'rId2', Type: `${REL}/theme`, Target: 'theme/theme1.xml' }),
    x('Relationship', { Id: 'rId3', Type: `${REL}/presProps`, Target: 'presProps.xml' }), x('Relationship', { Id: 'rId4', Type: `${REL}/viewProps`, Target: 'viewProps.xml' }),
    x('Relationship', { Id: 'rId5', Type: `${REL}/tableStyles`, Target: 'tableStyles.xml' }), x('Relationship', { Id: 'rId6', Type: `${REL}/notesMaster`, Target: 'notesMasters/notesMaster1.xml' })];
  const sldIds: string[] = [];
  outs.forEach((s, i) => {
    const n = i + 1;
    presRels.push(x('Relationship', { Id: `rId${10 + n}`, Type: `${REL}/slide`, Target: `slides/slide${n}.xml` }));
    sldIds.push(x('p:sldId', { id: 255 + n, 'r:id': `rId${10 + n}` }));
    const slideRels = [...s.rels];
    if (s.notes) {
      slideRels.push(x('Relationship', { Id: 'rIdN', Type: `${REL}/notesSlide`, Target: `../notesSlides/notesSlide${n}.xml` }));
      files.push([`ppt/notesSlides/notesSlide${n}.xml`, notesPart(s.notes)]);
      files.push([`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels([x('Relationship', { Id: 'rId1', Type: `${REL}/notesMaster`, Target: '../notesMasters/notesMaster1.xml' }), x('Relationship', { Id: 'rId2', Type: `${REL}/slide`, Target: `../slides/slide${n}.xml` })])]);
      ov(`/ppt/notesSlides/notesSlide${n}.xml`, `${CT}.notesSlide+xml`);
    }
    files.push([`ppt/slides/slide${n}.xml`, s.xml], [`ppt/slides/_rels/slide${n}.xml.rels`, rels(slideRels)]);
    ov(`/ppt/slides/slide${n}.xml`, `${CT}.slide+xml`);
    for (const [name, bytes] of s.media) files.push([`ppt/media/${name}`, bytes]);
    for (const [name, xml] of s.charts) { files.push([`ppt/charts/${name}`, xml]); ov(`/ppt/charts/${name}`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'); }
  });

  files.unshift(
    ['ppt/presentation.xml', XML_HEAD + x('p:presentation', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p, saveSubsetFonts: 1 },
      x('p:sldMasterIdLst', {}, x('p:sldMasterId', { id: 2147483648, 'r:id': 'rId1' })),
      x('p:notesMasterIdLst', {}, x('p:notesMasterId', { 'r:id': 'rId6' })),
      x('p:sldIdLst', {}, ...sldIds),
      x('p:sldSz', { cx: emu(W), cy: emu(H) }), x('p:notesSz', { cx: 6858000, cy: 9144000 }))],
    ['ppt/_rels/presentation.xml.rels', rels(presRels)],
    ['ppt/slideMasters/slideMaster1.xml', XML_HEAD + x('p:sldMaster', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p },
      x('p:cSld', {}, x('p:bg', {}, x('p:bgRef', { idx: 1001 }, x('a:schemeClr', { val: 'bg1' }))), emptyTree),
      x('p:clrMap', CLRMAP), x('p:sldLayoutIdLst', {}, x('p:sldLayoutId', { id: 2147483649, 'r:id': 'rId1' })))],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([x('Relationship', { Id: 'rId1', Type: `${REL}/slideLayout`, Target: '../slideLayouts/slideLayout1.xml' }), x('Relationship', { Id: 'rId2', Type: `${REL}/theme`, Target: '../theme/theme1.xml' })])],
    ['ppt/slideLayouts/slideLayout1.xml', XML_HEAD + x('p:sldLayout', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p, type: 'blank', preserve: 1 },
      x('p:cSld', { name: 'Blank' }, emptyTree), x('p:clrMapOvr', {}, x('a:masterClrMapping')))],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([x('Relationship', { Id: 'rId1', Type: `${REL}/slideMaster`, Target: '../slideMasters/slideMaster1.xml' })])],
    ['ppt/notesMasters/notesMaster1.xml', XML_HEAD + x('p:notesMaster', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p }, x('p:cSld', {}, emptyTree), x('p:clrMap', CLRMAP))],
    ['ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([x('Relationship', { Id: 'rId1', Type: `${REL}/theme`, Target: '../theme/theme2.xml' })])],
    ['ppt/theme/theme1.xml', themePart(th)],
    ['ppt/theme/theme2.xml', themePart(th, 'JAM notes')],
    ['ppt/presProps.xml', XML_HEAD + x('p:presentationPr', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p })],
    ['ppt/viewProps.xml', XML_HEAD + x('p:viewPr', { 'xmlns:a': NS.a, 'xmlns:r': NS.r, 'xmlns:p': NS.p }, x('p:normalViewPr'), x('p:gridSpacing', { cx: 76200, cy: 76200 }))],
    ['ppt/tableStyles.xml', XML_HEAD + x('a:tblStyleLst', { 'xmlns:a': NS.a, def: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' })],
    ['docProps/core.xml', XML_HEAD + x('cp:coreProperties', { 'xmlns:cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:dcterms': 'http://purl.org/dc/terms/', 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance' },
      x('dc:title', {}, esc(o.title || 'Presentation')), x('dc:creator', {}, 'JAM'))],
    ['docProps/app.xml', XML_HEAD + x('Properties', { xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties' }, x('Application', {}, 'JAM'), x('Slides', {}, String(outs.length)))],
    ['_rels/.rels', rels([x('Relationship', { Id: 'rId1', Type: `${REL}/officeDocument`, Target: 'ppt/presentation.xml' }),
      x('Relationship', { Id: 'rId2', Type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', Target: 'docProps/core.xml' }),
      x('Relationship', { Id: 'rId3', Type: `${REL}/extended-properties`, Target: 'docProps/app.xml' })])],
  );
  ov('/ppt/presentation.xml', `${CT}.presentation.main+xml`);
  ov('/ppt/slideMasters/slideMaster1.xml', `${CT}.slideMaster+xml`);
  ov('/ppt/slideLayouts/slideLayout1.xml', `${CT}.slideLayout+xml`);
  ov('/ppt/notesMasters/notesMaster1.xml', `${CT}.notesMaster+xml`);
  ov('/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml');
  ov('/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml');
  ov('/ppt/presProps.xml', `${CT}.presProps+xml`);
  ov('/ppt/viewProps.xml', `${CT}.viewProps+xml`);
  ov('/ppt/tableStyles.xml', `${CT}.tableStyles+xml`);
  ov('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml');
  ov('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml');
  const types = XML_HEAD + x('Types', { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
    x('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }), x('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    x('Default', { Extension: 'png', ContentType: 'image/png' }), x('Default', { Extension: 'jpeg', ContentType: 'image/jpeg' }), x('Default', { Extension: 'gif', ContentType: 'image/gif' }), ...over);
  files.unshift(['[Content_Types].xml', types]);
  return zip(files);
}
