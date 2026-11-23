/**
 * Preset shapes: the 186 shapes of Office Open XML (ECMA-376), the same set PowerPoint and DeckCraft
 * offer. Each shape is defined by guide formulas over its width, height, and adjust values, so arrows
 * keep their heads and callouts their tails at any size. This evaluates those definitions into SVG
 * paths, the text box, and the adjust handles. Data comes gzipped from `presets-data.ts`.
 */
import { PRESETS_GZ } from './presets-data';
import type { Box } from './types';

type Cmd = (string | number)[];
interface PathDef { w?: number; h?: number; f?: string; s?: 0; c: Cmd[] }
type Lim = [string, string | number, string | number];
interface HandleDef { pos: [string, string]; x?: Lim; y?: Lim; r?: Lim; a?: Lim }
export interface PresetDef { av?: [string, string][]; gd?: [string, string][]; ah?: HandleDef[]; tx?: [string, string, string, string]; p: PathDef[] }

let defs: Record<string, PresetDef> | null = null;

/**
 * Erratum in the standard's file: star24 and star32 cap their handle at "ssd2" (half the short side, a
 * length) though their adjust value runs to 50000, so any drag pinned the points flat. PowerPoint uses 50000.
 */
function fixDefs(d: Record<string, PresetDef>) {
  for (const n of ['star24', 'star32']) for (const hd of d[n]?.ah || []) if (hd.y && hd.y[2] === 'ssd2') hd.y = [hd.y[0], hd.y[1], 50000];
  return d;
}
let loading: Promise<void> | null = null;

/** Unpacks the shape definitions once. Resolves when they are ready. */
export function loadPresets(): Promise<void> {
  if (defs) return Promise.resolve();
  if (!loading) loading = (async () => {
    const bin = Uint8Array.from(atob(PRESETS_GZ), c => c.charCodeAt(0));
    const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    defs = fixDefs(JSON.parse(text));
  })();
  return loading;
}
/** Uses already-unpacked definitions (tests). */
export const setPresets = (d: Record<string, PresetDef>) => { defs = fixDefs(d); };
export const presetsReady = () => !!defs;
export const presetDef = (name?: string): PresetDef | undefined => (defs && name ? defs[name] : undefined);
export const presetNames = () => Object.keys(defs || {});

/* ---------- Guide formulas ---------- */

const ANG = 60000, RAD = Math.PI / 180 / ANG;
const CONST: Record<string, number> = { cd2: 10800000, cd4: 5400000, cd8: 2700000, '3cd4': 16200000, '3cd8': 8100000, '5cd8': 13500000, '7cd8': 18900000 };

/** Evaluates a shape's adjust values and guides for a size. `adj` overrides the default adjust values. */
export function guides(def: PresetDef, w: number, h: number, adj: Record<string, number> = {}): Record<string, number> {
  const ss = Math.min(w, h), ls = Math.max(w, h);
  const v: Record<string, number> = { ...CONST, w, h, l: 0, t: 0, r: w, b: h, hc: w / 2, vc: h / 2, ss, ls };
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 16, 32]) { v['wd' + n] = w / n; v['hd' + n] = h / n; v['ssd' + n] = ss / n; }
  const get = (tok: string): number => {
    if (tok in v) return v[tok];
    const n = Number(tok);
    if (!Number.isNaN(n)) return n;
    const m = /^(wd|hd|ssd)(\d+)$/.exec(tok);
    if (m) return (m[1] === 'wd' ? w : m[1] === 'hd' ? h : ss) / Number(m[2]);
    return 0;
  };
  const calc = (f: string): number => {
    const [op, ...a] = f.trim().split(/\s+/), x = a.map(get);
    switch (op) {
      case 'val': return x[0];
      case '*/': return x[2] ? (x[0] * x[1]) / x[2] : 0;
      case '+-': return x[0] + x[1] - x[2];
      case '+/': return x[2] ? (x[0] + x[1]) / x[2] : 0;
      case '?:': return x[0] > 0 ? x[1] : x[2];
      case 'abs': return Math.abs(x[0]);
      case 'at2': return Math.atan2(x[1], x[0]) / RAD;
      case 'cat2': return x[0] * Math.cos(Math.atan2(x[2], x[1]));
      case 'sat2': return x[0] * Math.sin(Math.atan2(x[2], x[1]));
      case 'cos': return x[0] * Math.cos(x[1] * RAD);
      case 'sin': return x[0] * Math.sin(x[1] * RAD);
      case 'tan': return x[0] * Math.tan(x[1] * RAD);
      case 'max': return Math.max(x[0], x[1]);
      case 'min': return Math.min(x[0], x[1]);
      case 'mod': return Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
      case 'pin': return Math.max(x[0], Math.min(x[2], x[1]));
      case 'sqrt': return Math.sqrt(Math.max(0, x[0]));
      default: return 0;
    }
  };
  for (const [name, f] of def.av || []) v[name] = name in adj ? adj[name] : calc(f);
  for (const [name, f] of def.gd || []) v[name] = calc(f);
  return v;
}

/** Default adjust values of a shape. */
export function defaultAdj(def: PresetDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, f] of def.av || []) out[name] = Number(f.split(/\s+/)[1]) || 0;
  return out;
}

/* ---------- Paths ---------- */

export interface PresetPath { d: string; fill: string; stroke: boolean }
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * An arc as DrawingML draws it: from the current point, around an ellipse of radii wR and hR, starting
 * at the visual angle `st` and sweeping `sw` (60000ths of a degree). Returns cubic Bezier segments and
 * the end point.
 */
function arc(px: number, py: number, wR: number, hR: number, st: number, sw: number): { d: string; x: number; y: number } {
  const par = (a: number) => Math.atan2(wR * Math.sin(a), hR * Math.cos(a));
  const a1 = st * RAD, t1 = par(a1), cx = px - wR * Math.cos(t1), cy = py - hR * Math.sin(t1);
  let dt: number;
  if (Math.abs(sw) >= 21600000) dt = Math.sign(sw) * 2 * Math.PI;
  else {
    dt = par(a1 + sw * RAD) - t1;
    if (sw > 0) while (dt < 0) dt += 2 * Math.PI;
    if (sw < 0) while (dt > 0) dt -= 2 * Math.PI;
    if (sw === 0) dt = 0;
  }
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  let d = '', t = t1;
  for (let i = 0; i < n; i++) {
    const c0 = Math.cos(t), s0 = Math.sin(t), c1 = Math.cos(t + step), s1 = Math.sin(t + step);
    d += `C${r2(cx + wR * (c0 - k * s0))} ${r2(cy + hR * (s0 + k * c0))} ${r2(cx + wR * (c1 + k * s1))} ${r2(cy + hR * (s1 - k * c1))} ${r2(cx + wR * c1)} ${r2(cy + hR * s1)}`;
    t += step;
  }
  return { d, x: cx + wR * Math.cos(t1 + dt), y: cy + hR * Math.sin(t1 + dt) };
}

/** A shape's paths at a size, in its own box (0,0 to w,h). Each path says how it fills and whether it is outlined. */
export function presetPaths(def: PresetDef, w: number, h: number, adj?: Record<string, number>): PresetPath[] {
  const v = guides(def, w, h, adj);
  const get = (tok: string | number) => typeof tok === 'number' ? tok : tok in v ? v[tok] : Number(tok) || 0;
  return def.p.map(p => {
    const sx = p.w ? w / p.w : 1, sy = p.h ? h / p.h : 1;
    let d = '', cx = 0, cy = 0;
    for (const c of p.c) {
      const op = c[0], a = c.slice(1);
      if (op === 'M' || op === 'L') { cx = get(a[0]) * sx; cy = get(a[1]) * sy; d += `${op}${r2(cx)} ${r2(cy)}`; }
      else if (op === 'Q' || op === 'C') {
        const pts = a.map((t, i) => get(t) * (i % 2 ? sy : sx));
        d += op + pts.map(r2).join(' ');
        cx = pts[pts.length - 2]; cy = pts[pts.length - 1];
      } else if (op === 'A') {
        const r = arc(cx, cy, get(a[0]) * sx, get(a[1]) * sy, get(a[2]), get(a[3]));
        d += r.d; cx = r.x; cy = r.y;
      } else if (op === 'Z') d += 'Z';
    }
    return { d, fill: p.f || 'norm', stroke: p.s !== 0 };
  });
}

/** The text box of a shape at a size, in its own box. */
export function presetText(def: PresetDef, w: number, h: number, adj?: Record<string, number>): Box {
  if (!def.tx) return { x: 0, y: 0, w, h };
  const v = guides(def, w, h, adj), g = (t: string) => t in v ? v[t] : Number(t) || 0;
  const [l, t, r, b] = def.tx.map(g);
  return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
}

/* ---------- Adjust handles ---------- */

export interface Handle { i: number; x: number; y: number; polar: boolean }

/** Where a shape's adjust handles sit, in its own box. */
export function presetHandles(def: PresetDef, w: number, h: number, adj?: Record<string, number>): Handle[] {
  const v = guides(def, w, h, adj), g = (t: string) => t in v ? v[t] : Number(t) || 0;
  return (def.ah || []).map((a, i) => ({ i, x: g(a.pos[0]), y: g(a.pos[1]), polar: !!(a.r || a.a) }));
}

/**
 * New adjust values for dragging handle `i` to a point in the shape's box. The guides are not
 * invertible in general, so each adjust value the handle drives is searched within its limits for the
 * value that brings the handle closest to the point.
 */
export function dragHandle(def: PresetDef, w: number, h: number, adj: Record<string, number>, i: number, px: number, py: number): Record<string, number> {
  const hd = def.ah?.[i];
  if (!hd) return adj;
  const out = { ...defaultAdj(def), ...adj };
  const lims = [hd.x, hd.y, hd.r, hd.a].filter(Boolean) as Lim[];
  const dist = (o: Record<string, number>) => {
    const v = guides(def, w, h, o), x = v[hd.pos[0]] ?? Number(hd.pos[0]), y = v[hd.pos[1]] ?? Number(hd.pos[1]);
    return (x - px) ** 2 + (y - py) ** 2;
  };
  for (let pass = 0; pass < 3; pass++) for (const [ref, mn, mx] of lims) {
    const v = guides(def, w, h, out), lo0 = typeof mn === 'number' ? mn : v[mn] ?? Number(mn), hi0 = typeof mx === 'number' ? mx : v[mx] ?? Number(mx);
    let lo = Math.min(lo0, hi0), hi = Math.max(lo0, hi0);
    if (hi - lo > 1e8) { const c = out[ref] || 0; lo = Math.max(lo, c - 3e5); hi = Math.min(hi, c + 3e5); }
    // Coarse scan, then golden-section search around the best sample.
    let best = out[ref], bestD = Infinity;
    for (let k = 0; k <= 40; k++) { const t = lo + (hi - lo) * k / 40, dd = dist({ ...out, [ref]: t }); if (dd < bestD) { bestD = dd; best = t; } }
    let a = Math.max(lo, best - (hi - lo) / 40), b = Math.min(hi, best + (hi - lo) / 40);
    for (let k = 0; k < 30; k++) {
      const m1 = b - (b - a) * 0.618, m2 = a + (b - a) * 0.618;
      if (dist({ ...out, [ref]: m1 }) < dist({ ...out, [ref]: m2 })) b = m2; else a = m1;
    }
    out[ref] = Math.round((a + b) / 2);
  }
  return out;
}

/* ---------- Catalog ---------- */

/** PowerPoint's shape gallery groups, in its order. Connectors and lines are left out (JAM has its own). */
export const SHAPE_GROUPS: [string, string[]][] = [
  ['Basic shapes', ['rect', 'roundRect', 'snip1Rect', 'snip2SameRect', 'round1Rect', 'round2SameRect', 'ellipse', 'triangle', 'rtTriangle', 'parallelogram', 'trapezoid', 'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'decagon', 'dodecagon', 'pie', 'chord', 'teardrop', 'frame', 'halfFrame', 'corner', 'diagStripe', 'plus', 'plaque', 'can', 'cube', 'bevel', 'donut', 'noSmoking', 'blockArc', 'foldedCorner', 'smileyFace', 'heart', 'lightningBolt', 'sun', 'moon', 'cloud', 'arc', 'bracketPair', 'bracePair', 'leftBracket', 'rightBracket', 'leftBrace', 'rightBrace']],
  ['Block arrows', ['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow', 'quadArrow', 'leftRightUpArrow', 'bentArrow', 'uturnArrow', 'leftUpArrow', 'bentUpArrow', 'curvedRightArrow', 'curvedLeftArrow', 'curvedUpArrow', 'curvedDownArrow', 'stripedRightArrow', 'notchedRightArrow', 'homePlate', 'chevron', 'rightArrowCallout', 'downArrowCallout', 'leftArrowCallout', 'upArrowCallout', 'leftRightArrowCallout', 'quadArrowCallout', 'circularArrow', 'swooshArrow']],
  ['Equation shapes', ['mathPlus', 'mathMinus', 'mathMultiply', 'mathDivide', 'mathEqual', 'mathNotEqual']],
  ['Flowchart', ['flowChartProcess', 'flowChartAlternateProcess', 'flowChartDecision', 'flowChartInputOutput', 'flowChartPredefinedProcess', 'flowChartInternalStorage', 'flowChartDocument', 'flowChartMultidocument', 'flowChartTerminator', 'flowChartPreparation', 'flowChartManualInput', 'flowChartManualOperation', 'flowChartConnector', 'flowChartOffpageConnector', 'flowChartPunchedCard', 'flowChartPunchedTape', 'flowChartSummingJunction', 'flowChartOr', 'flowChartCollate', 'flowChartSort', 'flowChartExtract', 'flowChartMerge', 'flowChartOnlineStorage', 'flowChartDelay', 'flowChartMagneticTape', 'flowChartMagneticDisk', 'flowChartMagneticDrum', 'flowChartDisplay']],
  ['Stars and banners', ['irregularSeal1', 'irregularSeal2', 'star4', 'star5', 'star6', 'star7', 'star8', 'star10', 'star12', 'star16', 'star24', 'star32', 'ribbon2', 'ribbon', 'ellipseRibbon2', 'ellipseRibbon', 'verticalScroll', 'horizontalScroll', 'wave', 'doubleWave']],
  ['Callouts', ['wedgeRectCallout', 'wedgeRoundRectCallout', 'wedgeEllipseCallout', 'cloudCallout', 'borderCallout1', 'borderCallout2', 'borderCallout3', 'accentCallout1', 'accentCallout2', 'accentCallout3', 'callout1', 'callout2', 'callout3', 'accentBorderCallout1', 'accentBorderCallout2', 'accentBorderCallout3']],
];

/** A readable name for a preset: rightArrow becomes Right arrow. */
export function presetLabel(name: string): string {
  const special: Record<string, string> = { rect: 'Rectangle', roundRect: 'Rounded rectangle', rtTriangle: 'Right triangle', homePlate: 'Pentagon arrow', irregularSeal2: 'Explosion 2', diagStripe: 'Diagonal stripe', snip1Rect: 'Snipped rectangle', round1Rect: 'Round corner rectangle',
    snip2SameRect: 'Snip same side corners', snip2DiagRect: 'Snip diagonal corners', snipRoundRect: 'Snip and round corner', round2SameRect: 'Round same side corners', round2DiagRect: 'Round diagonal corners',
    ribbon: 'Ribbon down', ribbon2: 'Ribbon up', ellipseRibbon: 'Curved ribbon down', ellipseRibbon2: 'Curved ribbon up', wedgeRectCallout: 'Rectangle callout', wedgeRoundRectCallout: 'Rounded rectangle callout', wedgeEllipseCallout: 'Oval callout',
    flowChartInputOutput: 'Flowchart data', bracketPair: 'Double bracket', bracePair: 'Double brace', leftRightUpArrow: 'Left, right, and up arrow', irregularSeal1: 'Explosion 1' };
  if (special[name]) return special[name];
  const s = name.replace(/^flowChart/, 'Flowchart ').replace(/^math/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
