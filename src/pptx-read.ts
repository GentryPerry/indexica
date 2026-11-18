/**
 * Open a PowerPoint file: slides become JAM slides with their shapes (preset geometry and adjust
 * values kept), text with levels and bullets, pictures with their crop, tables, charts (from the
 * values cached in the file), connectors, groups, backgrounds, and presenter notes. Theme colors and
 * fonts resolve through the slide's master; placeholders take their box, size, and bullets from the
 * layout and master. What JAM cannot draw (SmartArt, video, embedded objects) comes in as a labeled
 * box rather than disappearing.
 */
import type { ChartData, ChartKind, Series } from './chart';
import { presetDef } from './presetgeom';
import type { SubPath, VNode } from './vector';
import { setWorldPaths } from './vector';
import type { El } from './types';
import { normRuns, type Run } from './runs';
import { find, kid, kidsOf, parseXml, textOf, type XNode } from './xml';
import { text, unzip } from './zip';

export interface ImportedSlide { name?: string; fill?: string; notes?: string; els: El[] }
export interface ImportedDeck {
  w: number; h: number;
  slides: ImportedSlide[];
  /** Pictures by the source id the pieces use. */
  images: Map<string, { bytes: Uint8Array; mime: string }>;
  /** The deck's theme fonts as JAM font keys, and things that could not be brought in. */
  fonts: { major: string; minor: string };
  notes: string[];
}

const PX = 1 / 9525;
const px = (v: string | undefined) => Math.round(Number(v || 0) * PX * 100) / 100;

/* ---------- Package helpers ---------- */

type Files = Map<string, Uint8Array>;
const read = (f: Files, p: string): XNode | undefined => { const b = f.get(p); return b ? parseXml(text(b)) : undefined; };
/** Resolves a relative part target against the folder of the part that points to it. */
function resolve(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}
/** A part's relationships: id to { type, path }. */
function relsOf(f: Files, part: string): Map<string, { type: string; path: string }> {
  const dir = part.split('/').slice(0, -1).join('/'), name = part.split('/').pop();
  const doc = read(f, `${dir ? dir + '/' : ''}_rels/${name}.rels`), out = new Map<string, { type: string; path: string }>();
  for (const r of find(doc, 'Relationship')) out.set(r.at.Id, { type: r.at.Type.split('/').pop() || '', path: r.at.TargetMode === 'External' ? '' : resolve(part, r.at.Target) });
  return out;
}
const relOfType = (rels: Map<string, { type: string; path: string }>, type: string) => [...rels.values()].find(r => r.type === type)?.path;

/* ---------- Colors ---------- */

interface Ctx {
  scheme: Record<string, string>;
  map: Record<string, string>;
  /** The color a theme style reference passes in as phClr. */
  ph?: string;
}
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
function toRgb(h: string): [number, number, number] { const m = /^#?([0-9a-f]{6})/i.exec(h) || ['', '000000']; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]: number[]): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const PRESET: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' };

/** The color a fill-like node holds (srgbClr, schemeClr, sysClr, prstClr) with its modifiers applied. */
export function colorOf(n: XNode | undefined, ctx: Ctx): string | undefined {
  if (!n) return undefined;
  const c = n.kids.find(k => /^a:(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(k.tag));
  if (!c) return undefined;
  let base: string | undefined;
  if (c.tag === 'a:srgbClr') base = c.at.val;
  else if (c.tag === 'a:sysClr') base = c.at.lastClr || (c.at.val === 'window' ? 'FFFFFF' : '000000');
  else if (c.tag === 'a:prstClr') base = PRESET[c.at.val] || '000000';
  else if (c.tag === 'a:schemeClr') {
    if (c.at.val === 'phClr') base = ctx.ph ? ctx.ph.replace('#', '').slice(0, 6) : undefined;
    else base = ctx.scheme[ctx.map[c.at.val] || c.at.val]?.replace('#', '');
  } else if (c.tag === 'a:scrgbClr') base = [c.at.r, c.at.g, c.at.b].map(v => hex2(Number(v) / 100000 * 255)).join('');
  if (!base) return undefined;
  let rgb = toRgb(base).map(Number) as [number, number, number], alpha = 1;
  for (const m of c.kids) {
    const v = Number(m.at.val) / 100000;
    if (m.tag === 'a:lumMod' || m.tag === 'a:lumOff') { const hsl = rgbToHsl(rgb); hsl[2] = m.tag === 'a:lumMod' ? hsl[2] * v : Math.min(1, hsl[2] + v); rgb = hslToRgb(hsl); }
    else if (m.tag === 'a:tint') rgb = rgb.map(x => x * v + 255 * (1 - v)) as [number, number, number];
    else if (m.tag === 'a:shade') rgb = rgb.map(x => x * v) as [number, number, number];
    else if (m.tag === 'a:alpha') alpha = v;
    else if (m.tag === 'a:satMod') { const hsl = rgbToHsl(rgb); hsl[1] = Math.min(1, hsl[1] * v); rgb = hslToRgb(hsl); }
  }
  return '#' + rgb.map(hex2).join('') + (alpha < 0.999 ? hex2(alpha * 255) : '');
}
/** A shape fill: solid color, the first gradient stop, or 'none'. Undefined when the shape does not say. */
function fillOf(spPr: XNode | undefined, ctx: Ctx): string | undefined {
  if (!spPr) return undefined;
  if (kid(spPr, 'a:noFill')) return 'none';
  const s = kid(spPr, 'a:solidFill'); if (s) return colorOf(s, ctx);
  const g = kid(spPr, 'a:gradFill'); if (g) return colorOf(kid(g, 'a:gsLst', 'a:gs'), ctx);
  return undefined;
}

/* ---------- Text ---------- */

const SERIF = /georgia|times|cambria|garamond|merriweather|playfair|book|palatino|baskerville|serif|didot|bodoni/i;
const MONO = /consolas|courier|mono|menlo/i;
const ROUND = /rounded|varela|nunito|quicksand|comfortaa/i;
const NARROW = /narrow|condensed/i;
const HAND = /print|hand|comic|chalk|script|marker/i;
/** The closest JAM font for a typeface name. */
export function fontKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (MONO.test(name)) return /courier/i.test(name) ? 'type' : 'mono';
  if (HAND.test(name)) return 'hand';
  if (SERIF.test(name)) return 'serif';
  if (ROUND.test(name)) return 'round';
  if (NARROW.test(name)) return 'narrow';
  return 'sans';
}

interface TextStyleIn { size?: number; bold?: boolean; italic?: boolean; color?: string; font?: string; align?: string; bullet?: 'disc' | 'num' | 'none' }
/** Paragraph-level properties from a list style level (lvlNpPr) node. */
function levelStyle(lvl: XNode | undefined, ctx: Ctx, fonts: Record<string, string>): TextStyleIn {
  if (!lvl) return {};
  const d = kid(lvl, 'a:defRPr'), out: TextStyleIn = {};
  if (d?.at.sz) out.size = Number(d.at.sz) / 100 / 0.75;
  if (d?.at.b) out.bold = d.at.b === '1';
  if (d?.at.i) out.italic = d.at.i === '1';
  const col = d && colorOf(kid(d, 'a:solidFill'), ctx); if (col) out.color = col;
  const lt = d && kid(d, 'a:latin')?.at.typeface; if (lt) out.font = fonts[lt] || lt;
  if (lvl.at.algn) out.align = lvl.at.algn;
  if (kid(lvl, 'a:buNone')) out.bullet = 'none'; else if (kid(lvl, 'a:buAutoNum')) out.bullet = 'num'; else if (kid(lvl, 'a:buChar')) out.bullet = 'disc';
  return out;
}
const merge = (...ss: TextStyleIn[]): TextStyleIn => Object.assign({}, ...ss.map(s => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined))));

/* ---------- Charts ---------- */

function chartFrom(doc: XNode | undefined): ChartData | null {
  const plot = doc && kid(doc, 'c:chart', 'c:plotArea');
  if (!plot) return null;
  const node = plot.kids.find(k => /^c:(bar|bar3D|line|line3D|area|area3D|pie|pie3D|doughnut)Chart$/.test(k.tag));
  if (!node) return null;
  const type = node.tag.slice(2).replace('3D', '').replace('Chart', ''), grouping = kid(node, 'c:grouping')?.at.val || 'clustered';
  const horiz = kid(node, 'c:barDir')?.at.val === 'bar';
  let kind: ChartKind = 'column';
  if (type === 'bar') kind = grouping === 'percentStacked' ? (horiz ? 'percentBar' : 'percentColumn') : grouping === 'stacked' ? (horiz ? 'stackedBar' : 'stackedColumn') : horiz ? 'bar' : 'column';
  else if (type === 'line') {
    // Markers show unless every series turns them off; a chart with no symbols at all follows its own marker flag.
    const sym = find(node, 'c:symbol');
    kind = sym.length ? (sym.some(s => s.at.val !== 'none') ? 'lineMarkers' : 'line') : kid(node, 'c:marker')?.at.val === '1' ? 'lineMarkers' : 'line';
  }
  else if (type === 'area') kind = grouping === 'stacked' || grouping === 'percentStacked' ? 'stackedArea' : 'area';
  else if (type === 'pie') kind = 'pie';
  else if (type === 'doughnut') kind = 'doughnut';
  const pts = (n: XNode | undefined) => { const out: string[] = []; for (const p of find(n, 'c:pt')) out[Number(p.at.idx)] = textOf(kid(p, 'c:v') || p); return out; };
  const series: Series[] = kidsOf(node, 'c:ser').map((s, i) => {
    const tx = kid(s, 'c:tx'), name = tx ? (find(tx, 'c:v')[0] ? textOf(find(tx, 'c:v')[0]) : '') : '';
    return { name: name || `Series ${i + 1}`, vals: pts(kid(s, 'c:val')).map(v => Number(v) || 0) };
  });
  const first = kidsOf(node, 'c:ser')[0], cats = first ? pts(kid(first, 'c:cat')) : [];
  const n = Math.max(cats.length, ...series.map(s => s.vals.length));
  const title = kid(doc, 'c:chart', 'c:title'), legend = kid(doc, 'c:chart', 'c:legend');
  return {
    kind, cats: Array.from({ length: n }, (_, i) => cats[i] || `Category ${i + 1}`), series: series.map(s => ({ ...s, vals: Array.from({ length: n }, (_, i) => s.vals[i] || 0) })),
    title: title ? find(title, 'a:t').map(t => t.text).join('') || undefined : undefined,
    legend: !legend ? 'none' : kid(legend, 'c:legendPos')?.at.val === 'r' ? 'right' : 'bottom',
    labels: find(node, 'c:showVal').some(v => v.at.val === '1') || find(node, 'c:showPercent').some(v => v.at.val === '1'),
    grid: !!find(plot, 'c:majorGridlines').length,
  };
}

/* ---------- Geometry ---------- */

/** Converts a custom geometry's paths to subpaths on the board, within a box. */
function custPaths(cg: XNode, box: { x: number; y: number; w: number; h: number }): SubPath[] {
  const out: SubPath[] = [];
  for (const path of find(cg, 'a:path')) {
    const pw = Number(path.at.w) || box.w / PX, ph = Number(path.at.h) || box.h / PX;
    const sx = box.w / (pw || 1), sy = box.h / (ph || 1);
    const P = (p: XNode) => ({ x: box.x + Number(p.at.x) * sx, y: box.y + Number(p.at.y) * sy });
    let cur: SubPath | null = null;
    const last = () => cur!.nodes[cur!.nodes.length - 1];
    for (const c of path.kids) {
      const pts = kidsOf(c, 'a:pt');
      if (c.tag === 'a:moveTo') { cur = { nodes: [P(pts[0])] }; out.push(cur); }
      else if (!cur) continue;
      else if (c.tag === 'a:lnTo') cur.nodes.push(P(pts[0]));
      else if (c.tag === 'a:cubicBezTo') { const [a, b, e] = pts.map(P), l = last(); l.ox = a.x; l.oy = a.y; cur.nodes.push({ x: e.x, y: e.y, ix: b.x, iy: b.y } as VNode); }
      else if (c.tag === 'a:quadBezTo') { const [q, e] = pts.map(P), l = last(); l.ox = l.x + (q.x - l.x) * 2 / 3; l.oy = l.y + (q.y - l.y) * 2 / 3; cur.nodes.push({ x: e.x, y: e.y, ix: e.x + (q.x - e.x) * 2 / 3, iy: e.y + (q.y - e.y) * 2 / 3 }); }
      else if (c.tag === 'a:arcTo') {
        // An arc from the current point: sampled into short straight runs.
        const wR = Number(c.at.wR) * sx, hR = Number(c.at.hR) * sy, st = Number(c.at.stAng) / 60000 * Math.PI / 180, sw = Number(c.at.swAng) / 60000 * Math.PI / 180;
        const par = (a: number) => Math.atan2(wR * Math.sin(a), hR * Math.cos(a)), l = last(), t1 = par(st), cx = l.x - wR * Math.cos(t1), cy = l.y - hR * Math.sin(t1);
        let dt = par(st + sw) - t1; if (sw > 0) while (dt <= 0) dt += 2 * Math.PI; if (sw < 0) while (dt >= 0) dt -= 2 * Math.PI;
        const steps = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
        for (let k = 1; k <= steps; k++) { const t = t1 + dt * k / steps; cur.nodes.push({ x: cx + wR * Math.cos(t), y: cy + hR * Math.sin(t) }); }
      } else if (c.tag === 'a:close') cur.closed = true;
    }
  }
  return out.filter(s => s.nodes.length > 1);
}

/* ---------- Reading ---------- */

interface Box { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean }
type Tf = (b: Box) => Box;
const ident: Tf = b => b;
function boxOf(xf: XNode | undefined): Box | undefined {
  const off = kid(xf, 'a:off'), ext = kid(xf, 'a:ext');
  if (!off || !ext) return undefined;
  return { x: px(off.at.x), y: px(off.at.y), w: px(ext.at.cx), h: px(ext.at.cy), rot: xf!.at.rot ? Number(xf!.at.rot) / 60000 : undefined, flipH: xf!.at.flipH === '1', flipV: xf!.at.flipV === '1' };
}

/** Reads a .pptx file. */
export async function readPptx(buf: ArrayBuffer | Uint8Array): Promise<ImportedDeck> {
  const f = await unzip(buf);
  const rootRel = find(read(f, '_rels/.rels'), 'Relationship').find(r => r.at.Type.endsWith('/officeDocument'));
  const presPath = rootRel ? resolve('', rootRel.at.Target) : 'ppt/presentation.xml', pres = read(f, presPath);
  if (!pres) throw new Error('This file is not a PowerPoint presentation.');
  const pr = relsOf(f, presPath), sz = kid(pres, 'p:sldSz');
  const W = px(sz?.at.cx || '12192000'), H = px(sz?.at.cy || '6858000');
  const deck: ImportedDeck = { w: W, h: H, slides: [], images: new Map(), fonts: { major: 'sans', minor: 'sans' }, notes: [] };
  let n = 0, imgN = 0;
  const uid = (p: string) => `${p}${++n}`;
  const mediaIds = new Map<string, string>();

  for (const sid of find(kid(pres, 'p:sldIdLst'), 'p:sldId')) {
    const slidePath = pr.get(sid.at['r:id'])?.path;
    const slide = slidePath && read(f, slidePath);
    if (!slide || !slidePath) continue;
    const sr = relsOf(f, slidePath), layoutPath = relOfType(sr, 'slideLayout'), layout = layoutPath ? read(f, layoutPath) : undefined;
    const lr = layoutPath ? relsOf(f, layoutPath) : new Map(), masterPath = relOfType(lr, 'slideMaster'), master = masterPath ? read(f, masterPath) : undefined;
    const mr = masterPath ? relsOf(f, masterPath) : new Map(), themePath = relOfType(mr, 'theme'), theme = themePath ? read(f, themePath) : undefined;

    // Theme colors, the master's color map, and theme fonts.
    const scheme: Record<string, string> = {};
    for (const c of kid(theme, 'a:themeElements', 'a:clrScheme')?.kids || []) { const v = colorOf(c, { scheme: {}, map: {} }); if (v) scheme[c.tag.slice(2)] = v; }
    const map: Record<string, string> = { ...(kid(master, 'p:clrMap')?.at || { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }) };
    const ovr = kid(slide, 'p:clrMapOvr', 'a:overrideClrMapping'); if (ovr) Object.assign(map, ovr.at);
    const ctx: Ctx = { scheme, map };
    const fs = kid(theme, 'a:themeElements', 'a:fontScheme'), majorName = kid(fs, 'a:majorFont', 'a:latin')?.at.typeface, minorName = kid(fs, 'a:minorFont', 'a:latin')?.at.typeface;
    const fonts: Record<string, string> = { '+mj-lt': majorName || 'Calibri Light', '+mn-lt': minorName || 'Calibri' };
    deck.fonts = { major: fontKey(majorName) || 'sans', minor: fontKey(minorName) || 'sans' };

    // Placeholders on the layout and master, by idx and by type, for boxes and text styles.
    const phList = (doc: XNode | undefined) => find(kid(doc, 'p:cSld', 'p:spTree'), 'p:sp').map(sp => ({ sp, ph: kid(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph') })).filter(p => p.ph);
    const lph = phList(layout), mph = phList(master);
    const typeOf = (ph: XNode) => ph.at.type || 'body';
    const sameKind = (a: string, b: string) => a === b || (a === 'ctrTitle' && b === 'title') || (a === 'subTitle' && b === 'body') || (a === 'obj' && b === 'body');
    const inherit = (ph: XNode) => {
      const t = typeOf(ph), byIdx = (l: typeof lph) => ph.at.idx ? l.find(p => p.ph!.at.idx === ph.at.idx) : undefined;
      const l = byIdx(lph) || lph.find(p => sameKind(t, typeOf(p.ph!)) || sameKind(typeOf(p.ph!), t));
      const m = mph.find(p => sameKind(t, typeOf(p.ph!)) || sameKind(typeOf(p.ph!), t)) || (t !== 'title' && t !== 'ctrTitle' ? mph.find(p => typeOf(p.ph!) === 'body') : undefined);
      return [l?.sp, m?.sp].filter(Boolean) as XNode[];
    };
    const txStyles = kid(master, 'p:txStyles');
    const masterLevel = (kindName: string, lvl: number) => levelStyle(kid(txStyles, kindName, `a:lvl${lvl + 1}pPr`), ctx, fonts);

    const els: El[] = [];
    const out: ImportedSlide = { els, name: kid(slide, 'p:cSld')?.at.name };

    const textOfBody = (body: XNode, ph: XNode | undefined, chain: XNode[]) => {
      const kindName = !ph ? 'p:otherStyle' : /title/i.test(typeOf(ph)) ? 'p:titleStyle' : 'p:bodyStyle';
      const lines: string[] = [];
      let style: TextStyleIn = {}, sawRun = false, bullets: 'disc' | 'num' | undefined, off = 0;
      // Every run's own style, to keep formatting on part of a line.
      const segs: { s: number; e: number; st: TextStyleIn & { u?: boolean; x?: boolean }; para: number }[] = [], paraSize: number[] = [], paraTally: Map<number, number>[] = [];
      for (const p of kidsOf(body, 'a:p')) {
        const pPr = kid(p, 'a:pPr'), lvl = Math.min(8, Number(pPr?.at.lvl || 0));
        const inherited = merge(masterLevel(kindName, lvl), ...chain.slice().reverse().map(c => levelStyle(kid(c, 'p:txBody', 'a:lstStyle', `a:lvl${lvl + 1}pPr`), ctx, fonts)),
          levelStyle(kid(body, 'a:lstStyle', `a:lvl${lvl + 1}pPr`), ctx, fonts), pPr ? levelStyle(pPr, ctx, fonts) : {});
        const runs = p.kids.filter(k => k.tag === 'a:r' || k.tag === 'a:br' || k.tag === 'a:fld');
        const t = runs.map(r => r.tag === 'a:br' ? ' ' : (kid(r, 'a:t')?.text ?? '')).join('');
        if (t.trim() && inherited.bullet && inherited.bullet !== 'none' && !bullets) bullets = inherited.bullet;
        const r0 = runs.find(r => r.tag !== 'a:br'), rPr = r0 && kid(r0, 'a:rPr');
        const runStyle = (rp?: XNode) => merge(inherited, levelStyle({ tag: 'x', at: {}, text: '', kids: rp ? [{ ...rp, tag: 'a:defRPr' }] : [] }, ctx, fonts));
        if (!sawRun && t.trim()) { sawRun = true; style = runStyle(rPr); }
        let at = off + lvl;
        for (const r of runs) {
          const rt = r.tag === 'a:br' ? ' ' : (kid(r, 'a:t')?.text ?? '');
          if (r.tag !== 'a:br' && rt) {
            const rp = kid(r, 'a:rPr');
            segs.push({ s: at, e: at + rt.length, para: lines.length, st: { ...runStyle(rp), u: !!rp?.at.u && rp.at.u !== 'none', x: !!rp?.at.strike && rp.at.strike !== 'noStrike' } });
          }
          at += rt.length;
        }
        lines.push('\t'.repeat(lvl) + t); off += lvl + t.length + 1;
      }
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      const anchorOf = (b?: XNode) => kid(b, 'a:bodyPr')?.at.anchor;
      const anchor = anchorOf(body) || chain.map(c => anchorOf(kid(c, 'p:txBody'))).find(Boolean) || (kindName === 'p:titleStyle' ? 'ctr' : 't');
      // A paragraph's own size is the one most of its characters have; other sizes are runs.
      segs.forEach(g => { const tally = (paraTally[g.para] ||= new Map()), z = g.st.size ?? 0; tally.set(z, (tally.get(z) || 0) + g.e - g.s); });
      paraTally.forEach((m, i) => { paraSize[i] = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; });
      // The piece takes the first paragraph's own size, so a big first word stays a run.
      const firstSized = paraSize.findIndex(v => v != null && v > 0); if (firstSized >= 0) style = { ...style, size: paraSize[firstSized] };
      const text = lines.join('\n'), fk = (f?: string) => fontKey(f && fonts[f] ? fonts[f] : f) || 'sans', runs: Run[] = [];
      for (const g of segs) {
        const r: Run = { s: g.s, e: g.e };
        if (!!g.st.bold !== !!style.bold) r.w = g.st.bold ? 700 : 400;
        if (!!g.st.italic !== !!style.italic) r.i = !!g.st.italic;
        if (g.st.u) r.u = true;
        if (g.st.x) r.x = true;
        if (g.st.color && g.st.color.slice(0, 7) !== (style.color || '').slice(0, 7)) r.c = g.st.color.slice(0, 7);
        if (g.st.font && fk(g.st.font) !== fk(style.font)) r.f = fk(g.st.font);
        if (g.st.size && Math.abs(g.st.size - (paraSize[g.para] || g.st.size)) > 0.5) r.z = Math.round(g.st.size * 10) / 10;
        runs.push(r);
      }
      return { text, style, bullets, anchor, runs: normRuns(runs, text.length) };
    };

    type Rels = Map<string, { type: string; path: string }>;
    const walk = (tree: XNode, tf: Tf, group: string | undefined, rels: Rels, decor = false) => {
      for (const node of tree.kids) {
        const tag = node.tag;
        if (tag === 'p:grpSp') {
          const gx = kid(node, 'p:grpSpPr', 'a:xfrm'), off = boxOf(gx), chOff = kid(gx, 'a:chOff'), chExt = kid(gx, 'a:chExt');
          if (!off || !chOff || !chExt) { walk(node, tf, group || uid('g'), rels, decor); continue; }
          const cx = px(chOff.at.x), cy = px(chOff.at.y), cw = px(chExt.at.cx) || 1, ch = px(chExt.at.cy) || 1, kx = off.w / cw, ky = off.h / ch;
          const inner: Tf = b => tf({ ...b, x: off.x + (b.x - cx) * kx, y: off.y + (b.y - cy) * ky, w: b.w * kx, h: b.h * ky });
          walk(node, inner, group || uid('g'), rels, decor);
          continue;
        }
        const nvPr = node.kids.find(k => k.tag.startsWith('p:nv'));
        const ph = nvPr && kid(nvPr, 'p:nvPr', 'p:ph');
        // From a layout or master, only the decoration comes through; their placeholders are templates.
        if (decor && ph) continue;
        const chain = ph ? inherit(ph) : [];
        const spPr = kid(node, 'p:spPr') || kid(node, 'p:grpSpPr');
        let box = boxOf(kid(spPr, 'a:xfrm')) || boxOf(kid(node, 'p:xfrm'));
        if (!box) for (const c of chain) { box = boxOf(kid(c, 'p:spPr', 'a:xfrm')); if (box) break; }
        if (!box) continue;
        box = tf(box);
        const base = { id: uid('e'), z: els.length + 1, x: Math.round(box.x), y: Math.round(box.y), w: Math.max(4, Math.round(box.w)), h: Math.max(4, Math.round(box.h)), ...(box.rot ? { rot: Math.round(box.rot * 10) / 10 } : {}), ...(group ? { g: group } : {}) };
        // Style references (p:style) supply fill and line colors when the shape itself does not.
        const style = kid(node, 'p:style'), refColor = (ref?: XNode) => ref && Number(ref.at.idx) > 0 ? colorOf(ref, ctx) : undefined;
        const styleFill = refColor(kid(style, 'a:fillRef')), styleLine = refColor(kid(style, 'a:lnRef')), styleFont = colorOf(kid(style, 'a:fontRef'), ctx);
        const lnNode = kid(spPr, 'a:ln');
        const lineColor = lnNode ? (kid(lnNode, 'a:noFill') ? 'none' : colorOf(kid(lnNode, 'a:solidFill'), ctx) || colorOf(kid(lnNode, 'a:gradFill', 'a:gsLst', 'a:gs'), ctx)) : undefined;
        const lineW = lnNode?.at.w ? Math.max(0.5, Math.round(px(lnNode.at.w) * 10) / 10) : undefined;
        const line = lineColor ?? styleLine;

        if (tag === 'p:sp') {
          const body = kid(node, 'p:txBody'), t = body ? textOfBody(body, ph, chain) : null;
          const prst = kid(spPr, 'a:prstGeom')?.at.prst, cust = kid(spPr, 'a:custGeom');
          const fill = fillOf(spPr, ctx) ?? (styleFill || (ph ? undefined : undefined));
          const isBox = !!(kid(nvPr!, 'p:cNvSpPr')?.at.txBox === '1') || (!!ph && !prst && !cust) || ((!fill || fill === 'none') && (!line || line === 'none') && (!prst || prst === 'rect') && !cust);
          if (isBox) {
            if (!t || !t.text.trim()) continue;
            const kind = ph ? typeOf(ph) : '';
            const e: El = { ...base, type: 'text', text: t.text };
            applyText(e, t, fonts);
            if (t.runs.length) e.runs = t.runs;
            if (/title/i.test(kind)) { e.ph = 'title'; } else if (kind === 'subTitle') e.ph = 'subtitle'; else if (ph && (kind === 'body' || kind === 'obj' || !ph.at.type)) e.ph = 'body';
            if (e.ph) e.va = t.anchor === 'b' ? 'bottom' : t.anchor === 'ctr' ? 'middle' : 'top';
            if (e.ph === 'body' && t.bullets) e.bullets = t.bullets;
            if (!e.ph && t.bullets) e.bullets = t.bullets;
            els.push(e);
            continue;
          }
          let e: El;
          if (cust) { e = { ...base, type: 'path' } as El; setWorldPaths(e, custPaths(cust, box)); if (!e.paths || !(e.paths as unknown[]).length) continue; }
          else if (prst === 'ellipse') e = { ...base, type: 'ellipse' };
          else e = { ...base, type: 'rect', preset: prst && presetDef(prst) ? prst : 'rect' };
          const adj: Record<string, number> = {};
          for (const gd of find(kid(spPr, 'a:prstGeom', 'a:avLst'), 'a:gd')) { const m = /^val\s+(-?\d+)/.exec(gd.at.fmla || ''); if (m) adj[gd.at.name] = Number(m[1]); }
          if (Object.keys(adj).length && e.type === 'rect') e.adj = adj;
          e.fill = fill && fill !== 'none' ? fill : fill === 'none' ? 'none' : '#ffffff';
          if (line === 'none' || !line) e.stroke = line === 'none' ? 'none' : e.type === 'path' ? undefined : 'none'; else e.stroke = line;
          if (lineW && line && line !== 'none') e.sw = lineW;
          if (e.type === 'path' && e.fill === 'none') delete e.fill;
          if (t && t.text.trim()) { e.text = t.text; applyText(e, t, fonts); if (!e.color && styleFont) e.color = styleFont; }
          els.push(e);
        } else if (tag === 'p:pic') {
          const blip = find(node, 'a:blip')[0], rid = blip?.at['r:embed'], media = rid ? rels.get(rid)?.path : undefined;
          if (!media || !f.has(media)) continue;
          let src = mediaIds.get(media);
          if (!src) {
            const ext = media.split('.').pop()!.toLowerCase(), mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : '';
            if (!mime) { els.push(missing(base, 'Picture in a format JAM cannot show')); continue; }
            src = `pptx${++imgN}`; mediaIds.set(media, src); deck.images.set(src, { bytes: f.get(media)!, mime });
          }
          const e: El = { ...base, type: 'image', src };
          const sr2 = kid(find(node, 'p:blipFill')[0], 'a:srcRect');
          if (sr2) { const c = ['l', 't', 'r', 'b'].map(k => Math.max(0, Number(sr2.at[k] || 0) / 100000)) as [number, number, number, number]; if (c.some(v => v > 0)) e.crop = c; }
          if (kid(spPr, 'a:prstGeom')?.at.prst === 'ellipse') e.oval = true;
          if (line && line !== 'none' && lineW) { e.stroke = line; e.sw = lineW; }
          els.push(e);
        } else if (tag === 'p:graphicFrame') {
          const gd = find(node, 'a:graphicData')[0], uri = gd?.at.uri || '';
          if (uri.endsWith('/table')) {
            const tbl = kid(gd, 'a:tbl'), rows = kidsOf(tbl, 'a:tr');
            const cells = rows.map(r => kidsOf(r, 'a:tc').map(c => find(c, 'a:p').map(p => find(p, 'a:t').map(t => t.text).join('')).join(' ')));
            const tp = kid(tbl, 'a:tblPr'), widths = find(kid(tbl, 'a:tblGrid'), 'a:gridCol').map(g => Number(g.at.w) || 1);
            const firstFill = rows[0] && colorOf(kid(kid(kidsOf(rows[0], 'a:tc')[0], 'a:tcPr'), 'a:solidFill'), ctx);
            const e: El = { ...base, type: 'table', cells, header: tp?.at.firstRow === '1', tstyle: 'medium2', band: tp?.at.bandRow === '1', tacc: firstFill && firstFill !== '#ffffff' ? firstFill : scheme.accent1 || '#2e6fd8' };
            if (tp?.at.firstCol === '1') e.firstCol = true;
            if (tp?.at.lastRow === '1') e.lastRow = true;
            if (widths.length === Math.max(...cells.map(r => r.length))) e.colw = widths.map(w => w / widths.reduce((a, b) => a + b, 0));
            const sz = find(tbl, 'a:rPr').find(r => r.at.sz)?.at.sz; e.size = sz ? Math.round(Number(sz) / 75) : 18;
            els.push(e);
          } else if (uri.endsWith('/chart')) {
            const rid = kid(gd, 'c:chart')?.at['r:id'], cp = rid ? rels.get(rid)?.path : undefined;
            const data = cp ? chartFrom(read(f, cp)) : null;
            els.push(data ? { ...base, type: 'chart', chart: data } : missing(base, 'Chart of a kind JAM does not draw yet'));
          } else {
            const what = /diagram/.test(uri) ? 'SmartArt diagram' : /ole|package/.test(uri) ? 'Embedded object' : 'Object';
            els.push(missing(base, `${what} (not imported)`));
          }
        } else if (tag === 'p:cxnSp') {
          const sx = box.flipH ? box.x + box.w : box.x, sy = box.flipV ? box.y + box.h : box.y, ex = box.flipH ? box.x : box.x + box.w, ey = box.flipV ? box.y : box.y + box.h;
          const head = lnNode && kid(lnNode, 'a:tailEnd')?.at.type, tail = lnNode && kid(lnNode, 'a:headEnd')?.at.type;
          const map2 = (t?: string) => !t || t === 'none' ? 'none' : t === 'oval' ? 'circle' : t === 'arrow' ? 'arrow' : 'triangle';
          const e: El = { id: base.id, z: base.z, type: 'conn', x: 0, y: 0, w: 0, h: 0, a: null, b: null, ax: Math.round(sx), ay: Math.round(sy), bx: Math.round(ex), by: Math.round(ey), head: map2(head) as El['head'], tail: map2(tail) as El['tail'] };
          if (line && line !== 'none') e.stroke = line; if (lineW) e.sw = lineW;
          if (group) e.g = group;
          els.push(e);
        } else if (tag === 'mc:AlternateContent') {
          const choice = kid(node, 'mc:Fallback') || kid(node, 'mc:Choice');
          if (choice) walk(choice, tf, group, rels, decor);
        }
      }
    };
    // Master and layout decoration (logos, bands, shapes) sits under the slide's own pieces, unless hidden.
    if (slide.at.showMasterSp !== '0') {
      const mt = kid(master, 'p:cSld', 'p:spTree'), lt = kid(layout, 'p:cSld', 'p:spTree');
      if (mt && layout?.at.showMasterSp !== '0') walk(mt, ident, undefined, mr, true);
      if (lt) walk(lt, ident, undefined, lr, true);
    }
    const tree = kid(slide, 'p:cSld', 'p:spTree');
    if (tree) walk(tree, ident, undefined, sr);

    // Background: the slide's, else the layout's, else the master's.
    for (const doc of [slide, layout, master]) {
      const bg = kid(doc, 'p:cSld', 'p:bg');
      if (!bg) continue;
      const pr2 = kid(bg, 'p:bgPr'), ref = kid(bg, 'p:bgRef');
      const col = pr2 ? fillOf(pr2, ctx) : ref ? colorOf(ref, ctx) : undefined;
      if (col && col !== 'none') { out.fill = col.slice(0, 7); break; }
    }
    if (!out.fill) out.fill = scheme[map.bg1 || 'lt1'] || '#ffffff';

    // Presenter notes: the body placeholder of the notes page.
    const notesPath = relOfType(sr, 'notesSlide'), notes = notesPath ? read(f, notesPath) : undefined;
    if (notes) {
      const body = find(notes, 'p:sp').find(sp => kid(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph')?.at.type === 'body');
      if (body) { const t = find(body, 'a:p').map(p => find(p, 'a:t').map(x => x.text).join('')).join('\n').trim(); if (t) out.notes = t; }
    }
    deck.slides.push(out);
  }
  return deck;
}

/** Text style onto a piece: size, weight, italic, color, font, alignment. */
function applyText(e: El, t: { style: TextStyleIn }, fonts: Record<string, string>) {
  const s = t.style;
  if (s.size) e.size = Math.round(s.size * 10) / 10;
  if (s.bold) e.weight = 700;
  if (s.italic) e.italic = true;
  if (s.color) e.color = s.color.slice(0, 7);
  const key = fontKey(s.font && fonts[s.font] ? fonts[s.font] : s.font);
  if (key && key !== 'sans') e.font = key;
  if (s.align === 'ctr') e.align = 'center'; else if (s.align === 'r') e.align = 'right';
}
/** A labeled stand-in for something JAM cannot draw. */
function missing(base: { id: string; z: number; x: number; y: number; w: number; h: number }, label: string): El {
  return { ...base, type: 'rect', preset: 'rect', fill: '#f3f5f8', stroke: '#8c96a3', dash: 'dash', text: label, color: '#5d697c', size: 14 };
}
