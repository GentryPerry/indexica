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
