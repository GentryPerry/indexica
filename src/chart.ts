/**
 * Charts, after DeckCraft's chart model: a small data table (categories by series) drawn as column,
 * bar, line, area, pie, doughnut, scatter (categories are the X values), radar, or combo (columns with
 * the last series as a line) charts, stacked or percent where it makes sense, colored from the deck
 * theme's accents, with optional titles on the horizontal and vertical axes. `chartLayout` turns a chart into plain drawing marks so the renderer stays thin
 * and the layout can be tested.
 */

export type ChartKind = 'column' | 'stackedColumn' | 'percentColumn' | 'bar' | 'stackedBar' | 'percentBar' | 'line' | 'lineMarkers' | 'area' | 'stackedArea' | 'pie' | 'doughnut'
  | 'scatter' | 'scatterLines' | 'radar' | 'radarFilled' | 'combo';
export interface Series { name: string; vals: number[]; color?: string }
export interface ChartData {
  kind: ChartKind;
  cats: string[];
  series: Series[];
  title?: string;
  legend?: 'bottom' | 'right' | 'none';
  labels?: boolean;
  grid?: boolean;
  /** Titles on the horizontal (x) and vertical (y) axes, by where they sit. */
  xTitle?: string;
  yTitle?: string;
}

export const CHART_KINDS: [ChartKind, string, string][] = [
  ['column', 'Column', 'M4 16V9M8 16V5M12 16V11M16 16V7'],
  ['stackedColumn', 'Stacked column', 'M5 16V6M10 16V9M15 16V4M3.5 11h3M8.5 13h3M13.5 9h3'],
  ['percentColumn', '100% column', 'M5 16V4M10 16V4M15 16V4M3.5 9h3M8.5 12h3M13.5 7h3'],
  ['bar', 'Bar', 'M4 5h7M4 9h11M4 13h5M4 17h9'],
  ['stackedBar', 'Stacked bar', 'M4 6h10M4 10h7M4 14h12M9 4.5v3M7 8.5v3M11 12.5v3'],
  ['percentBar', '100% bar', 'M4 6h12M4 10h12M4 14h12M9 4.5v3M12 8.5v3M7 12.5v3'],
  ['line', 'Line', 'M3 15l4-5 4 2 6-7'],
  ['lineMarkers', 'Line with markers', 'M3 15l4-5 4 2 6-7M7 10h.01M11 12h.01M17 5h.01'],
  ['area', 'Area', 'M3 16V12l4-4 4 2 6-5v11z'],
  ['stackedArea', 'Stacked area', 'M3 16v-3l4-3 4 1 6-4v9zM3 13l4-6 4 1 6-5'],
  ['pie', 'Pie', 'M10 3a7 7 0 1 0 7 7h-7zM12 2a6 6 0 0 1 6 6h-6z'],
  ['doughnut', 'Doughnut', 'M10 3a7 7 0 1 0 .01 0M10 7a3 3 0 1 0 .01 0'],
  ['scatter', 'Scatter', 'M3 3v14h14M6.5 13h.01M9 9.5h.01M12 11h.01M14.5 6h.01M8 6.5h.01'],
  ['scatterLines', 'Scatter with lines', 'M3 3v14h14M6 14l3-4 3 1 4-6M6 14h.01M9 10h.01M12 11h.01M16 5h.01'],
  ['radar', 'Radar', 'M10 2.5l7 5-2.7 8.5H5.7L3 7.5zM10 6l3.5 3-1.5 4.5h-4L6.5 9z'],
  ['radarFilled', 'Filled radar', 'M10 2.5l7 5-2.7 8.5H5.7L3 7.5zM10 6l3.5 3-1.5 4.5h-4L6.5 9zM10 7.5l2 2-1 3H9l-1-3z'],
  ['combo', 'Column and line', 'M4.5 16v-5M8.5 16V8M12.5 16v-4M16.5 16V9M3 9l4-3 4 3 6-5'],
];
/** Charts drawn on X and Y value axes rather than categories. */
export const isScatter = (k: ChartKind) => k === 'scatter' || k === 'scatterLines';
export const isRadar = (k: ChartKind) => k === 'radar' || k === 'radarFilled';
/** X values of a scatter chart: the categories when they are numbers, otherwise 1, 2, 3 in order (a chart switched from columns). */
export const xValues = (c: ChartData) => c.cats.every(s => s.trim() !== '' && Number.isFinite(Number(s.replace(/[,$€£%\s]/g, '')))) ? c.cats.map(num) : c.cats.map((_, i) => i + 1);
/** Charts that can carry axis titles. */
export const hasAxes = (k: ChartKind) => k !== 'pie' && k !== 'doughnut' && !isRadar(k);

/** PowerPoint's starting chart: four quarters, three series (and, for scatter, its X and Y sample). */
export const sampleChart = (kind: ChartKind = 'column'): ChartData => isScatter(kind) ? {
  kind, cats: ['0.7', '1.8', '2.6', '3.2', '4.1'], legend: 'bottom', grid: true,
  series: [{ name: 'Y values', vals: [2.7, 3.2, 0.8, 2.4, 3.9] }],
} : {
  kind, cats: ['Q1', 'Q2', 'Q3', 'Q4'], legend: 'bottom', grid: true,
  series: [{ name: 'Series 1', vals: [4.3, 2.5, 3.5, 4.5] }, { name: 'Series 2', vals: [2.4, 4.4, 1.8, 2.8] }, { name: 'Series 3', vals: [2, 2, 3, 5] }],
};

/* ---------- Data editing ---------- */

/** Reads tab- or comma-separated rows (as pasted from a spreadsheet): first row series names, first column categories. */
export function fromTable(text: string, kind: ChartKind): ChartData | null {
  const rows = text.replace(/\r\n?/g, '\n').trim().split('\n').map(r => r.split(r.includes('\t') ? '\t' : ',').map(c => c.trim()));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const names = rows[0].slice(1), body = rows.slice(1);
  return {
    kind, cats: body.map(r => r[0] || ''), legend: 'bottom', grid: true,
    series: names.map((name, i) => ({ name: name || `Series ${i + 1}`, vals: body.map(r => num(r[i + 1])) })),
  };
}
/** A number from a cell, ignoring thousands separators, currency, and percent signs. Blank or junk is 0. */
export function num(s: string | undefined): number {
  const n = Number(String(s ?? '').replace(/[,$€£%\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
export const addCategory = (c: ChartData): ChartData => ({ ...c, cats: [...c.cats, `Category ${c.cats.length + 1}`], series: c.series.map(s => ({ ...s, vals: [...s.vals, 0] })) });
export const addSeries = (c: ChartData): ChartData => ({ ...c, series: [...c.series, { name: `Series ${c.series.length + 1}`, vals: c.cats.map(() => 0) }] });
export const dropCategory = (c: ChartData, i: number): ChartData => c.cats.length < 2 ? c : ({ ...c, cats: c.cats.filter((_, k) => k !== i), series: c.series.map(s => ({ ...s, vals: s.vals.filter((_, k) => k !== i) })) });
export const dropSeries = (c: ChartData, i: number): ChartData => c.series.length < 2 ? c : ({ ...c, series: c.series.filter((_, k) => k !== i) });

/* ---------- Scales ---------- */

/** Round axis bounds and a step that gives about `n` gridlines. */
export function niceScale(lo: number, hi: number, n = 5): { min: number; max: number; step: number } {
  if (lo === hi) { hi = lo + 1; if (lo > 0) lo = 0; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(lo / step + 1e-9) * step, max: Math.ceil(hi / step - 1e-9) * step, step };
}
/** A tick label: short, without float noise. */
export function tickLabel(v: number, percent = false): string {
  if (percent) return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}K`;
  return String(+v.toFixed(2));
}

/* ---------- Layout ---------- */

export type Mark =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { k: 'path'; d: string; fill?: string; stroke?: string; width?: number; opacity?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { k: 'dot'; x: number; y: number; r: number; fill: string; stroke: string }
  | { k: 'text'; x: number; y: number; text: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; weight?: number; rot?: number };

export interface ChartInk { ink: string; muted: string; grid: string; surface: string }
type Measure = (text: string, size: number) => number;

const STACKED = new Set<ChartKind>(['stackedColumn', 'percentColumn', 'stackedBar', 'percentBar', 'stackedArea']);
const PERCENT = new Set<ChartKind>(['percentColumn', 'percentBar']);
const HORIZ = new Set<ChartKind>(['bar', 'stackedBar', 'percentBar']);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Colors of the series (or, for pie charts, the slices), cycling through the accents with darker repeats. */
export function seriesColors(c: ChartData, accents: string[]): string[] {
  const pie = c.kind === 'pie' || c.kind === 'doughnut', n = pie ? c.cats.length : c.series.length;
  return Array.from({ length: n }, (_, i) => (!pie && c.series[i].color) || accents[i % accents.length] + (i >= accents.length ? 'b3' : ''));
}

/**
 * The marks that draw a chart in a box of w by h (from 0,0). Text sizes scale gently with the box so a
 * chart reads on a slide and on the board alike.
 */
export function chartLayout(c: ChartData, w: number, h: number, accents: string[], ink: ChartInk, measure: Measure): Mark[] {
  const out: Mark[] = [], fs = Math.max(10, Math.min(18, Math.min(w, h) / 22)), pad = fs, colors = seriesColors(c, accents);
  const pie = c.kind === 'pie' || c.kind === 'doughnut';
  let top = pad, bottom = h - pad, left = pad, right = w - pad;
  if (c.title) { out.push({ k: 'text', x: w / 2, y: top + fs * 1.2, text: c.title, size: fs * 1.3, fill: ink.ink, anchor: 'middle', weight: 600 }); top += fs * 2.1; }

  // Legend: a row under the chart, or a column on the right.
  const legendNames = pie ? c.cats : c.series.map(s => s.name), legend = c.legend || 'bottom';
  if (legend !== 'none' && legendNames.length) {
    const sw = fs * 0.75, gap = fs * 1.2, widths = legendNames.map(n => sw + fs * 0.4 + measure(n, fs));
    if (legend === 'bottom') {
      const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
      let x = Math.max(left, (w - total) / 2); const y = bottom - fs * 0.5;
      legendNames.forEach((n, i) => {
        out.push({ k: 'rect', x, y: y - sw, w: sw, h: sw, fill: colors[i] }, { k: 'text', x: x + sw + fs * 0.4, y: y - sw * 0.1, text: n, size: fs, fill: ink.muted, anchor: 'start' });
        x += widths[i] + gap;
      });
      bottom -= fs * 2;
    } else {
      const lw = Math.max(...widths); let y = top + fs;
      legendNames.forEach((n, i) => {
        out.push({ k: 'rect', x: right - lw, y: y - sw, w: sw, h: sw, fill: colors[i] }, { k: 'text', x: right - lw + sw + fs * 0.4, y: y - sw * 0.1, text: n, size: fs, fill: ink.muted, anchor: 'start' });
        y += fs * 1.6;
      });
      right -= lw + fs;
    }
  }

  if (pie) { pieMarks(c, out, colors, (left + right) / 2, (top + bottom) / 2, Math.max(4, Math.min(right - left, bottom - top) / 2), fs, ink); return out; }
  if (isRadar(c.kind)) { radarMarks(c, out, colors, left, top, right, bottom, fs, ink, measure); return out; }

  // Axis titles take the outer edge: the vertical one turned on the left, the horizontal one along the bottom.
  const axisTitles = hasAxes(c.kind);
  let yTitleX = 0, xTitleY = 0;
  if (axisTitles && c.yTitle) { yTitleX = left + fs * 0.7; left += fs * 1.6; }
  if (axisTitles && c.xTitle) { xTitleY = bottom - fs * 0.25; bottom -= fs * 1.7; }
  const titles = (pl: number, pt: number, pr: number, pb: number) => {
    if (yTitleX) out.push({ k: 'text', x: yTitleX, y: (pt + pb) / 2, text: c.yTitle!, size: fs, fill: ink.muted, anchor: 'middle', weight: 600, rot: -90 });
    if (xTitleY) out.push({ k: 'text', x: (pl + pr) / 2, y: xTitleY, text: c.xTitle!, size: fs, fill: ink.muted, anchor: 'middle', weight: 600 });
  };
  if (isScatter(c.kind)) { scatterMarks(c, out, colors, left, top, right, bottom, fs, ink, measure, titles); return out; }

  // Values per category: stacked sums, or plain extremes.
  const n = c.cats.length, all = c.series, combo = c.kind === 'combo' && all.length > 1, ser = combo ? all.slice(0, -1) : all, stacked = STACKED.has(c.kind), percent = PERCENT.has(c.kind), horiz = HORIZ.has(c.kind);
  const totals = c.cats.map((_, i) => ser.reduce((a, s) => a + Math.abs(s.vals[i] || 0), 0) || 1);
  const val = (si: number, i: number) => { const v = ser[si].vals[i] || 0; return percent ? v / totals[i] : v; };
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    if (stacked) { let pos = 0, neg = 0; ser.forEach((_, si) => { const v = val(si, i); if (v >= 0) pos += v; else neg += v; }); hi = Math.max(hi, pos); lo = Math.min(lo, neg); }
    else ser.forEach((_, si) => { hi = Math.max(hi, val(si, i)); lo = Math.min(lo, val(si, i)); });
    if (combo) { const v = all[all.length - 1].vals[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  const sc = percent ? { min: Math.min(0, lo), max: 1, step: 0.25 } : niceScale(lo, hi);
  const ticks: number[] = []; for (let v = sc.min; v <= sc.max + sc.step * 1e-6; v += sc.step) ticks.push(+v.toFixed(10));

  // Axis room: value labels on one side, category labels on the other.
  const valW = Math.max(...ticks.map(t => measure(tickLabel(t, percent), fs))) + fs * 0.6;
  const catW = Math.max(0, ...c.cats.map(t => measure(t, fs))) + fs * 0.6;
  if (horiz) { left += catW; bottom -= fs * 1.6; } else { left += valW; bottom -= fs * 1.6; }
  const pw = Math.max(1, right - left), ph = Math.max(1, bottom - top);
  titles(left, top, right, bottom);
  const vpos = (v: number) => horiz ? left + ((v - sc.min) / (sc.max - sc.min)) * pw : bottom - ((v - sc.min) / (sc.max - sc.min)) * ph;

  for (const t of ticks) {
    const p = vpos(t);
    if (horiz) {
      if (c.grid !== false) out.push({ k: 'line', x1: r1(p), y1: top, x2: r1(p), y2: bottom, stroke: ink.grid, width: 1 });
      out.push({ k: 'text', x: p, y: bottom + fs * 1.3, text: tickLabel(t, percent), size: fs, fill: ink.muted, anchor: 'middle' });
    } else {
      if (c.grid !== false) out.push({ k: 'line', x1: left, y1: r1(p), x2: right, y2: r1(p), stroke: ink.grid, width: 1 });
      out.push({ k: 'text', x: left - fs * 0.5, y: p + fs * 0.35, text: tickLabel(t, percent), size: fs, fill: ink.muted, anchor: 'end' });
    }
  }
  const band = (horiz ? ph : pw) / Math.max(1, n), zero = vpos(Math.max(sc.min, Math.min(sc.max, 0)));
  c.cats.forEach((cat, i) => {
    const mid = (horiz ? top : left) + band * (i + 0.5);
    if (horiz) out.push({ k: 'text', x: left - fs * 0.5, y: mid + fs * 0.35, text: cat, size: fs, fill: ink.muted, anchor: 'end' });
    else out.push({ k: 'text', x: mid, y: bottom + fs * 1.3, text: cat, size: fs, fill: ink.muted, anchor: 'middle' });
  });
  out.push(horiz ? { k: 'line', x1: r1(zero), y1: top, x2: r1(zero), y2: bottom, stroke: ink.muted, width: 1 } : { k: 'line', x1: left, y1: r1(zero), x2: right, y2: r1(zero), stroke: ink.muted, width: 1 });

  const label = (v: number, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'middle') => {
    if (c.labels) out.push({ k: 'text', x, y, text: tickLabel(v, percent), size: fs * 0.9, fill: ink.ink, anchor });
  };

  if (c.kind.startsWith('line') || c.kind.endsWith('rea')) {
    const xs = c.cats.map((_, i) => left + band * (i + 0.5)), base = c.cats.map(() => 0);
    const lines: { pts: [number, number][]; low: [number, number][] }[] = ser.map((_, si) => {
      const low = xs.map((x, i) => [x, vpos(stacked ? base[i] : 0)] as [number, number]);
      const pts = xs.map((x, i) => { const v = val(si, i) + (stacked ? base[i] : 0); if (stacked) base[i] = v; return [x, vpos(v)] as [number, number]; });
      return { pts, low };
    });
    lines.forEach(({ pts, low }, si) => {
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');
      if (c.kind.endsWith('rea')) out.push({ k: 'path', d: d + low.slice().reverse().map(([x, y]) => `L${r1(x)} ${r1(y)}`).join('') + 'Z', fill: colors[si], opacity: stacked ? 0.9 : 0.75 });
      else out.push({ k: 'path', d, stroke: colors[si], width: Math.max(2, fs / 5) });
      if (c.kind === 'lineMarkers') pts.forEach(([x, y]) => out.push({ k: 'dot', x, y, r: Math.max(3, fs / 3.5), fill: colors[si], stroke: ink.surface }));
      pts.forEach(([x, y], i) => label(ser[si].vals[i] || 0, x, y - fs * 0.6));
    });
    return out;
  }

  // Columns and bars.
  const groupW = band * 0.72, k = stacked ? 1 : Math.max(1, ser.length), bw = groupW / k;
  c.cats.forEach((_, i) => {
    const start = (horiz ? top : left) + band * i + (band - groupW) / 2;
    let pos = 0, neg = 0;
    ser.forEach((s, si) => {
      const v = val(si, i), from = stacked ? (v >= 0 ? pos : neg) : 0, to = from + v;
      if (stacked) { if (v >= 0) pos = to; else neg = to; }
      const a = vpos(from), b = vpos(to), off = start + (stacked ? 0 : bw * si), gap = stacked || k === 1 ? 0 : Math.min(2, bw * 0.08);
      if (horiz) {
        out.push({ k: 'rect', x: r1(Math.min(a, b)), y: r1(off + gap / 2), w: r1(Math.abs(b - a)), h: r1(bw - gap), fill: colors[si] });
        label(s.vals[i] || 0, stacked ? (a + b) / 2 : b + fs * 0.4, off + bw / 2 + fs * 0.35, stacked ? 'middle' : 'start');
      } else {
        out.push({ k: 'rect', x: r1(off + gap / 2), y: r1(Math.min(a, b)), w: r1(bw - gap), h: r1(Math.abs(b - a)), fill: colors[si] });
        label(s.vals[i] || 0, off + bw / 2, stacked ? (a + b) / 2 + fs * 0.35 : b - fs * 0.4);
      }
    });
  });
  if (combo) {
    // The last series rides over the columns as a line with markers.
    const li = all.length - 1, ls = all[li], pts = c.cats.map((_, i) => [left + band * (i + 0.5), vpos(ls.vals[i] || 0)] as [number, number]);
    out.push({ k: 'path', d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(''), stroke: colors[li], width: Math.max(2, fs / 5) });
    pts.forEach(([x, y], i) => { out.push({ k: 'dot', x, y, r: Math.max(3, fs / 3.5), fill: colors[li], stroke: ink.surface }); label(ls.vals[i] || 0, x, y - fs * 0.6); });
  }
  return out;
}

/**
 * Scatter: the categories are X values and each series a set of Y values, on two value axes with
 * round bounds. With lines, points join in the order of the table, as PowerPoint draws them.
 */
function scatterMarks(c: ChartData, out: Mark[], colors: string[], left: number, top: number, right: number, bottom: number, fs: number, ink: ChartInk, measure: Measure,
  titles: (l: number, t: number, r: number, b: number) => void) {
  const xs = xValues(c), ys = c.series.flatMap(s => s.vals.map(v => v || 0));
  const sx = niceScale(Math.min(0, ...xs), Math.max(0, ...xs)), sy = niceScale(Math.min(0, ...ys), Math.max(0, ...ys));
  const ticks = (s: { min: number; max: number; step: number }) => { const o: number[] = []; for (let v = s.min; v <= s.max + s.step * 1e-6; v += s.step) o.push(+v.toFixed(10)); return o; };
  const tx = ticks(sx), ty = ticks(sy);
  left += Math.max(...ty.map(v => measure(tickLabel(v), fs))) + fs * 0.6; bottom -= fs * 1.6;
  const pw = Math.max(1, right - left), ph = Math.max(1, bottom - top);
  titles(left, top, right, bottom);
  const X = (v: number) => left + ((v - sx.min) / (sx.max - sx.min)) * pw, Y = (v: number) => bottom - ((v - sy.min) / (sy.max - sy.min)) * ph;
  for (const v of ty) {
    if (c.grid !== false) out.push({ k: 'line', x1: left, y1: r1(Y(v)), x2: right, y2: r1(Y(v)), stroke: ink.grid, width: 1 });
    out.push({ k: 'text', x: left - fs * 0.5, y: Y(v) + fs * 0.35, text: tickLabel(v), size: fs, fill: ink.muted, anchor: 'end' });
  }
  for (const v of tx) {
    if (c.grid !== false) out.push({ k: 'line', x1: r1(X(v)), y1: top, x2: r1(X(v)), y2: bottom, stroke: ink.grid, width: 1 });
    out.push({ k: 'text', x: X(v), y: bottom + fs * 1.3, text: tickLabel(v), size: fs, fill: ink.muted, anchor: 'middle' });
  }
  const zy = Y(Math.max(sy.min, Math.min(sy.max, 0))), zx = X(Math.max(sx.min, Math.min(sx.max, 0)));
  out.push({ k: 'line', x1: left, y1: r1(zy), x2: right, y2: r1(zy), stroke: ink.muted, width: 1 }, { k: 'line', x1: r1(zx), y1: top, x2: r1(zx), y2: bottom, stroke: ink.muted, width: 1 });
  c.series.forEach((s, si) => {
    const pts = xs.map((x, i) => [X(x), Y(s.vals[i] || 0)] as [number, number]);
    if (c.kind === 'scatterLines') out.push({ k: 'path', d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(''), stroke: colors[si], width: Math.max(2, fs / 5) });
    pts.forEach(([x, y], i) => {
      out.push({ k: 'dot', x, y, r: Math.max(3.5, fs / 3), fill: colors[si], stroke: ink.surface });
      if (c.labels) out.push({ k: 'text', x, y: y - fs * 0.7, text: tickLabel(s.vals[i] || 0), size: fs * 0.9, fill: ink.ink, anchor: 'middle' });
    });
  });
}

/**
 * Radar: one spoke per category from the center, rings at round values, and each series a closed
 * outline (filled, for the filled kind), starting at twelve o'clock and going clockwise.
 */
function radarMarks(c: ChartData, out: Mark[], colors: string[], left: number, top: number, right: number, bottom: number, fs: number, ink: ChartInk, measure: Measure) {
  const n = Math.max(3, c.cats.length), vals = c.series.flatMap(s => s.vals.map(v => v || 0));
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const labW = Math.max(0, ...c.cats.map(t => measure(t, fs)));
  const cx = (left + right) / 2, cy = (top + bottom) / 2 + fs * 0.2, r = Math.max(4, Math.min((right - left) / 2 - labW - fs * 0.6, (bottom - top) / 2 - fs * 1.4));
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2, at = (i: number, v: number) => {
    const k = (v - sc.min) / (sc.max - sc.min || 1);
    return [cx + r * k * Math.cos(ang(i)), cy + r * k * Math.sin(ang(i))] as [number, number];
  };
  const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('') + 'Z';
  for (let v = sc.min + sc.step; v <= sc.max + sc.step * 1e-6; v += sc.step) {
    if (c.grid !== false) out.push({ k: 'path', d: poly(Array.from({ length: n }, (_, i) => at(i, v))), stroke: ink.grid, width: 1 });
    const [, y] = at(0, v);
    out.push({ k: 'text', x: cx + fs * 0.3, y: y + fs * 0.35, text: tickLabel(+v.toFixed(10)), size: fs * 0.85, fill: ink.muted, anchor: 'start' });
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i, sc.max), a = ang(i), cos = Math.cos(a);
    out.push({ k: 'line', x1: r1(cx), y1: r1(cy), x2: r1(x), y2: r1(y), stroke: ink.grid, width: 1 });
    const lx = cx + (r + fs * 0.6) * cos, ly = cy + (r + fs * 0.6) * Math.sin(a) + fs * 0.35 + (Math.sin(a) < -0.9 ? -fs * 0.3 : Math.sin(a) > 0.9 ? fs * 0.5 : 0);
    out.push({ k: 'text', x: lx, y: ly, text: c.cats[i] ?? '', size: fs, fill: ink.muted, anchor: Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end' });
  }
  c.series.forEach((s, si) => {
    const pts = Array.from({ length: n }, (_, i) => at(i, s.vals[i] || 0));
    out.push(c.kind === 'radarFilled' ? { k: 'path', d: poly(pts), fill: colors[si], opacity: 0.35, stroke: colors[si], width: Math.max(1.5, fs / 7) }
      : { k: 'path', d: poly(pts), stroke: colors[si], width: Math.max(2, fs / 5) });
    if (c.kind === 'radar') pts.forEach(([x, y]) => out.push({ k: 'dot', x, y, r: Math.max(3, fs / 3.5), fill: colors[si], stroke: ink.surface }));
    if (c.labels) pts.forEach(([x, y], i) => out.push({ k: 'text', x, y: y - fs * 0.6, text: tickLabel(s.vals[i] || 0), size: fs * 0.9, fill: ink.ink, anchor: 'middle' }));
  });
}

/** Pie and doughnut slices for the first series, starting at twelve o'clock and going clockwise. */
function pieMarks(c: ChartData, out: Mark[], colors: string[], cx: number, cy: number, r: number, fs: number, ink: ChartInk) {
  const vals = (c.series[0]?.vals || []).map(v => Math.max(0, v || 0)), sum = vals.reduce((a, b) => a + b, 0) || 1;
  const inner = c.kind === 'doughnut' ? r * 0.55 : 0;
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    const sweep = (v / sum) * Math.PI * 2;
    if (sweep <= 0) return;
    const a2 = a + sweep, big = sweep > Math.PI ? 1 : 0, pt = (rr: number, t: number) => `${r1(cx + rr * Math.cos(t))} ${r1(cy + rr * Math.sin(t))}`;
    let d: string;
    if (sweep >= Math.PI * 2 - 1e-6) d = inner ? `M${pt(r, a)}A${r} ${r} 0 1 1 ${pt(r, a + Math.PI)}A${r} ${r} 0 1 1 ${pt(r, a)}ZM${pt(inner, a)}A${inner} ${inner} 0 1 0 ${pt(inner, a + Math.PI)}A${inner} ${inner} 0 1 0 ${pt(inner, a)}Z`
      : `M${pt(r, a)}A${r} ${r} 0 1 1 ${pt(r, a + Math.PI)}A${r} ${r} 0 1 1 ${pt(r, a)}Z`;
    else d = inner ? `M${pt(r, a)}A${r} ${r} 0 ${big} 1 ${pt(r, a2)}L${pt(inner, a2)}A${inner} ${inner} 0 ${big} 0 ${pt(inner, a)}Z`
      : `M${cx} ${cy}L${pt(r, a)}A${r} ${r} 0 ${big} 1 ${pt(r, a2)}Z`;
    out.push({ k: 'path', d, fill: colors[i], stroke: ink.surface, width: 1.5 });
    if (c.labels !== false && sweep > 0.25) {
      const m = (a + a2) / 2, lr = inner ? (r + inner) / 2 : r * 0.62;
      out.push({ k: 'text', x: cx + lr * Math.cos(m), y: cy + lr * Math.sin(m) + fs * 0.35, text: `${Math.round((v / sum) * 100)}%`, size: fs, fill: '#ffffff', anchor: 'middle', weight: 600 });
    }
    a = a2;
  });
}
