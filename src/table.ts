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

/** A cell's box in board coordinates, before the table's rotation. Rows and columns share the space evenly. */
export function cellBox(e: El, r: number, c: number): Box {
  const cw = e.w / colsOf(e), rh = e.h / rowsOf(e);
  return { x: e.x + c * cw, y: e.y + r * rh, w: cw, h: rh };
}

/** Which cell a board point falls in, allowing for rotation; null when outside the table. */
export function cellAt(e: El, x: number, y: number): [number, number] | null {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = -(e.rot || 0) * Math.PI / 180;
  const lx = cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), ly = cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r);
  if (lx < e.x || lx > e.x + e.w || ly < e.y || ly > e.y + e.h) return null;
  return [Math.min(rowsOf(e) - 1, Math.floor((ly - e.y) / (e.h / rowsOf(e)))), Math.min(colsOf(e) - 1, Math.floor((lx - e.x) / (e.w / colsOf(e))))];
}

/** The next cell when pressing Tab (or Shift+Tab), wrapping across rows; null past either end. */
export function stepCell(e: El, r: number, c: number, back: boolean): [number, number] | null {
  const cols = colsOf(e), i = r * cols + c + (back ? -1 : 1);
  return i < 0 || i >= rowsOf(e) * cols ? null : [Math.floor(i / cols), i % cols];
}
