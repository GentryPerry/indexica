import { describe, expect, it } from 'vitest';
import { cellAt, cellBox, colsOf, emptyCells, insertCol, insertRow, normCells, removeCol, removeRow, rowsOf, stepCell } from '../src/table';
import type { El } from '../src/types';

const table = (p: Partial<El> = {}): El => ({ id: 't', type: 'table', z: 1, x: 0, y: 0, w: 300, h: 120, cells: emptyCells(3, 3), ...p });

describe('table cells', () => {
  it('starts empty at the asked size', () => {
    const t = table();
    expect([rowsOf(t), colsOf(t)]).toEqual([3, 3]);
  });
  it('pads ragged rows', () => expect(normCells([['a'], ['b', 'c']])).toEqual([['a', ''], ['b', 'c']]));
  it('adds and removes rows and columns without touching the original', () => {
    const c = [['a', 'b'], ['c', 'd']];
    expect(insertRow(c, 1)).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    expect(insertCol(c, 2)).toEqual([['a', 'b', ''], ['c', 'd', '']]);
    expect(removeRow(c, 0)).toEqual([['c', 'd']]);
    expect(removeCol(c, 1)).toEqual([['a'], ['c']]);
    expect(c).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('never removes the last row or column', () => {
    expect(removeRow([['a']], 0)).toEqual([['a']]);
    expect(removeCol([['a'], ['b']], 0)).toEqual([['a'], ['b']]);
  });
});

describe('finding cells', () => {
  it('gives each cell an equal share', () => expect(cellBox(table(), 1, 2)).toEqual({ x: 200, y: 40, w: 100, h: 40 }));
  it('finds the cell under a point', () => {
    expect(cellAt(table(), 150, 100)).toEqual([2, 1]);
    expect(cellAt(table(), 400, 10)).toBeNull();
  });
  it('allows for rotation', () => {
    // Turned a half turn, the top-left corner area holds the bottom-right cell.
    expect(cellAt(table({ rot: 180 }), 10, 10)).toEqual([2, 2]);
  });
  it('Tab walks across rows and stops at the ends', () => {
    expect(stepCell(table(), 0, 2, false)).toEqual([1, 0]);
    expect(stepCell(table(), 1, 0, true)).toEqual([0, 2]);
    expect(stepCell(table(), 2, 2, false)).toBeNull();
    expect(stepCell(table(), 0, 0, true)).toBeNull();
  });
});
