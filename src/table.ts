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
const startOf = (fr: number[], c: number) => fr.slice(0, c).reduce((a, b) => a + b, 0);

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

/** A cell's box in board coordinates, before the table's rotation. Rows share the height evenly. */
export function cellBox(e: El, r: number, c: number): Box {
  const fr = colFractions(e), rh = e.h / rowsOf(e);
  return { x: e.x + e.w * startOf(fr, c), y: e.y + r * rh, w: e.w * fr[c], h: rh };
}

/** Which cell a board point falls in, allowing for rotation; null when outside the table. */
export function cellAt(e: El, x: number, y: number): [number, number] | null {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = -(e.rot || 0) * Math.PI / 180;
  const lx = cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), ly = cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r);
  if (lx < e.x || lx > e.x + e.w || ly < e.y || ly > e.y + e.h) return null;
  const fr = colFractions(e), share = (lx - e.x) / e.w;
  let col = 0, acc = 0;
  for (; col < fr.length - 1; col++) { acc += fr[col]; if (share < acc) break; }
  return [Math.min(rowsOf(e) - 1, Math.floor((ly - e.y) / (e.h / rowsOf(e)))), col];
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
