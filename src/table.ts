import type { Box, El } from './types';

/** An empty grid of cells. */
export const emptyCells = (rows: number, cols: number): string[][] => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));

export const rowsOf = (e: El) => (e.cells || [['']]).length;
export const colsOf = (e: El) => Math.max(1, ...(e.cells || [['']]).map(r => r.length));

/** Cells with every row padded to the same number of columns. */
export function normCells(cells: string[][] | undefined): string[][] {
  const rows = cells && cells.length ? cells : [['']], cols = Math.max(1, ...rows.map(r => r.length));
  return rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
}

export function insertRow(cells: string[][], at: number): string[][] {
  const c = normCells(cells), out = c.map(r => [...r]);
  out.splice(Math.max(0, Math.min(at, out.length)), 0, Array(c[0].length).fill(''));
  return out;
}
export function insertCol(cells: string[][], at: number): string[][] {
  return normCells(cells).map(r => { const n = [...r]; n.splice(Math.max(0, Math.min(at, n.length)), 0, ''); return n; });
}
export function removeRow(cells: string[][], at: number): string[][] {
  const c = normCells(cells); if (c.length <= 1) return c;
  return c.filter((_, i) => i !== at);
}
export function removeCol(cells: string[][], at: number): string[][] {
  const c = normCells(cells); if (c[0].length <= 1) return c;
  return c.map(r => r.filter((_, i) => i !== at));
}

/** Each column's share of the table width, adding up to 1. */
export function colFractions(e: El): number[] {
  const n = colsOf(e), f = e.colw && e.colw.length === n ? e.colw : null;
  if (!f) return Array(n).fill(1 / n);
  const sum = f.reduce((a, b) => a + b, 0) || 1;
  return f.map(v => v / sum);
}
/** Each row's share of the table height, adding up to 1. */
export function rowFractions(e: El): number[] {
  const n = rowsOf(e), f = e.rowh && e.rowh.length === n ? e.rowh : null;
  if (!f) return Array(n).fill(1 / n);
  const sum = f.reduce((a, b) => a + b, 0) || 1;
  return f.map(v => v / sum);
}
const startOf = (fr: number[], c: number) => fr.slice(0, c).reduce((a, b) => a + b, 0);
/** Where each border falls, as shares from the start: 0, the inner borders, and 1. */
export const edgesOf = (fr: number[]) => fr.reduce((acc, f) => [...acc, acc[acc.length - 1] + f], [0]);

/** Move the border between column i and i + 1 by `delta` (a share of the table width), keeping both at least `min`. */
export function resizeCols(fr: number[], i: number, delta: number, min = 0.06): number[] {
  if (i < 0 || i >= fr.length - 1) return fr;
  const pair = fr[i] + fr[i + 1], a = Math.min(pair - min, Math.max(min, fr[i] + delta)), out = [...fr];
  out[i] = a; out[i + 1] = pair - a;
  return out;
}
/** Column shares after adding a column at `at`: the new one takes an even share and the rest shrink to fit. */
export function sharesWithCol(fr: number[], at: number): number[] {
  const n = fr.length, out = fr.map(v => v * n / (n + 1));
  out.splice(Math.max(0, Math.min(at, n)), 0, 1 / (n + 1));
  return out;
}
/** Column shares after removing column `at`, spread back over the rest. */
export function sharesWithoutCol(fr: number[], at: number): number[] {
  if (fr.length <= 1) return fr;
  const rest = fr.filter((_, i) => i !== at), sum = rest.reduce((a, b) => a + b, 0) || 1;
  return rest.map(v => v / sum);
}

/** A cell's box in board coordinates, before the table's rotation. */
export function cellBox(e: El, r: number, c: number): Box {
  const fr = colFractions(e), rf = rowFractions(e);
  return { x: e.x + e.w * startOf(fr, c), y: e.y + e.h * startOf(rf, r), w: e.w * fr[c], h: e.h * (rf[r] ?? 0) };
}

/** Which cell a board point falls in, allowing for rotation; null when outside the table. */
export function cellAt(e: El, x: number, y: number): [number, number] | null {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = -(e.rot || 0) * Math.PI / 180;
  const lx = cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), ly = cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r);
  if (lx < e.x || lx > e.x + e.w || ly < e.y || ly > e.y + e.h) return null;
  const pick = (fr: number[], share: number) => { let i = 0, acc = 0; for (; i < fr.length - 1; i++) { acc += fr[i]; if (share < acc) break; } return i; };
  return [pick(rowFractions(e), (ly - e.y) / e.h), pick(colFractions(e), (lx - e.x) / e.w)];
}

/* ---------- Rows and columns as a whole (Figma-style table editing) ---------- */

export type Line = 'row' | 'col';
const N = (fr: number[]) => fr.map(v => Math.round(v * 10000) / 10000);
const spliceRuns = (e: El, f: (rows: (unknown[] | null)[][]) => (unknown[] | null)[][]) => {
  if (!e.cruns) return;
  const rows = normCells(e.cells).map((r, i) => r.map((_, k) => (e.cruns?.[i]?.[k] as unknown[] | null) ?? null));
  const out = f(rows);
  if (out.some(r => r.some(x => x && x.length))) e.cruns = out as El['cruns']; else delete e.cruns;
};

/**
 * Adds an empty row or column before index `at` (0 to the count). The new line takes an average share
 * and the table grows by that much, so the other rows or columns keep their size, as in Figma.
 */
export function addLine(e: El, kind: Line, at: number): El {
  const cells = normCells(e.cells), n = kind === 'row' ? cells.length : cells[0].length;
  const i = Math.max(0, Math.min(at, n));
  spliceRuns(e, rows => kind === 'row' ? [...rows.slice(0, i), Array(cells[0].length).fill(null), ...rows.slice(i)] : rows.map(r => [...r.slice(0, i), null, ...r.slice(i)]));
  e.cells = kind === 'row' ? insertRow(cells, i) : insertCol(cells, i);
  const fr = kind === 'row' ? rowFractions({ ...e, cells }) : colFractions({ ...e, cells }), size = kind === 'row' ? e.h : e.w;
  const add = size / n, total = size + add;
  const out = fr.map(v => v * size / total); out.splice(i, 0, add / total);
  if (kind === 'row') { e.h = Math.round(total); if (e.rowh || fr.some(v => Math.abs(v - fr[0]) > 1e-6)) e.rowh = N(out); }
  else { e.w = Math.round(total); if (e.colw || fr.some(v => Math.abs(v - fr[0]) > 1e-6)) e.colw = N(out); }
  return e;
}

/** Removes row or column `at` and shrinks the table by its size. A table keeps at least one of each. */
export function removeLine(e: El, kind: Line, at: number): El {
  const cells = normCells(e.cells), n = kind === 'row' ? cells.length : cells[0].length;
  if (n <= 1 || at < 0 || at >= n) return e;
  const fr = kind === 'row' ? rowFractions(e) : colFractions(e), size = kind === 'row' ? e.h : e.w;
  const gone = fr[at] * size, total = size - gone;
  spliceRuns(e, rows => kind === 'row' ? rows.filter((_, k) => k !== at) : rows.map(r => r.filter((_, k) => k !== at)));
  e.cells = kind === 'row' ? removeRow(cells, at) : removeCol(cells, at);
  const out = fr.filter((_, k) => k !== at).map(v => v * size / total);
  if (kind === 'row') { e.h = Math.max(1, Math.round(total)); if (e.rowh) e.rowh = N(out); }
  else { e.w = Math.max(1, Math.round(total)); if (e.colw) e.colw = N(out); }
  return e;
}

/** Moves row or column `from` to index `to`, taking its text, styled words, and size along. */
export function moveLine(e: El, kind: Line, from: number, to: number): El {
  const cells = normCells(e.cells), n = kind === 'row' ? cells.length : cells[0].length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return e;
  const mv = <T>(a: T[]) => { const b = [...a], [x] = b.splice(from, 1); b.splice(to, 0, x); return b; };
  e.cells = kind === 'row' ? mv(cells) : cells.map(r => mv(r));
  spliceRuns(e, rows => kind === 'row' ? mv(rows) : rows.map(r => mv(r)));
  if (kind === 'row' && e.rowh && e.rowh.length === n) e.rowh = mv(e.rowh);
  if (kind === 'col' && e.colw && e.colw.length === n) e.colw = mv(e.colw);
  return e;
}

/** The smallest share a row may shrink to when its border is dragged: room for one line of text. */
export function minRowShare(e: El, size: number): number {
  return Math.min(0.5, (size * 1.3 + 16) / Math.max(1, e.h));
}

/** The next cell when pressing Tab (or Shift+Tab), wrapping across rows; null past either end. */
export function stepCell(e: El, r: number, c: number, back: boolean): [number, number] | null {
  const cols = colsOf(e), i = r * cols + c + (back ? -1 : 1);
  return i < 0 || i >= rowsOf(e) * cols ? null : [Math.floor(i / cols), i % cols];
}

/* ---------- Table styles (DeckCraft's built-in looks, generated from one accent color) ---------- */

export type TableKind = 'none' | 'grid' | 'light1' | 'light2' | 'medium2' | 'medium4' | 'dark1';
export const TABLE_KINDS: [TableKind, string][] = [
  ['medium2', 'Medium 2'], ['medium4', 'Medium 4'], ['light1', 'Light 1'], ['light2', 'Light 2'], ['dark1', 'Dark 1'], ['grid', 'Grid only'], ['none', 'No style'],
];

const lin = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const gam = (v: number) => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
function rgb(hex: string): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const s = m ? m[1] : '2e6fd8';
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
}
const hexOf = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
/** DrawingML tint: `k` of the color, the rest white, mixed in linear light (tint 20% is a pale wash). */
export const tint = (hex: string, k: number) => hexOf(rgb(hex).map(v => gam(lin(v) * k + (1 - k))));
/** DrawingML shade: `k` of the color, the rest black, in linear light. */
export const shade = (hex: string, k: number) => hexOf(rgb(hex).map(v => gam(lin(v) * k)));

/** How one cell of a styled table looks. Unset fill or text means none or the default ink. */
export interface CellLook { fill?: string; text?: string; bold: boolean; border?: [string, number] }

/**
 * A cell's look in a styled table: header row, total row, first column, and banded rows pick the
 * parts of the style, as DeckCraft's renderer does for PowerPoint's built-in styles.
 */
export function cellLook(e: El, r: number, c: number): CellLook {
  const kind = (e.tstyle || 'medium2') as TableKind, a = e.tacc || '#2e6fd8', rows = rowsOf(e);
  const header = !!e.header && r === 0, total = !!e.lastRow && r === rows - 1 && rows > 1, first = !!e.firstCol && c === 0;
  const bodyR = e.header ? r - 1 : r, banded = !!e.band && !header && !total && bodyR % 2 === 0;
  const strong = header || total || first;
  switch (kind) {
    case 'none': return { bold: header };
    case 'grid': return { bold: header, border: ['#1d2530', 0.75] };
    case 'light1': { const fill = banded ? tint(a, 0.2) : undefined; return { fill, bold: strong, border: header ? [a, 1] : undefined }; }
    case 'light2': return { fill: header ? a : undefined, text: header ? '#ffffff' : undefined, bold: header || total || first, border: [a, 1] };
    case 'dark1': return { fill: header ? '#000000' : banded ? shade(a, 0.6) : shade(a, 0.75), text: '#ffffff', bold: header || total || first, border: ['#ffffff', 1] };
    case 'medium4': return { fill: header || banded ? tint(a, 0.4) : tint(a, 0.2), bold: strong, border: [a, 0.75] };
    default: return { fill: strong ? a : banded ? tint(a, 0.4) : tint(a, 0.2), text: strong ? '#ffffff' : undefined, bold: strong, border: ['#ffffff', 1] };
  }
}
