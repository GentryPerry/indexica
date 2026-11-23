import { describe, expect, it } from 'vitest';
import { addLine, cellAt, cellBox, colsOf, edgesOf, emptyCells, insertCol, insertRow, moveLine, normCells, removeCol, removeLine, removeRow, rowFractions, rowsOf, stepCell } from '../src/table';
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

describe('rows and columns as a whole', () => {
  const t = (o: Partial<El> = {}): El => ({ id: 't', type: 'table', x: 0, y: 0, w: 300, h: 120, cells: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], ...o } as El);
  it('adds a row without squashing the others', () => {
    const e = addLine(t(), 'row', 1);
    expect(e.cells!.map(r => r[0])).toEqual(['a', '', 'd', 'g']);
    expect(e.h).toBe(160);
    expect(cellBox(e, 0, 0).h).toBeCloseTo(40);
  });
  it('adds a column at either end and keeps hand-set widths', () => {
    const e = addLine(t({ colw: [0.5, 0.25, 0.25] }), 'col', 3);
    expect(e.cells![0]).toEqual(['a', 'b', 'c', '']);
    expect(e.w).toBe(400);
    expect(cellBox(e, 0, 0).w).toBeCloseTo(150);
    expect(cellBox(e, 0, 3).w).toBeCloseTo(100);
  });
  it('removes a line and shrinks by its size, keeping one of each', () => {
    const e = removeLine(t({ rowh: [0.5, 0.25, 0.25] }), 'row', 0);
    expect(e.cells!.map(r => r[0])).toEqual(['d', 'g']);
    expect(e.h).toBe(60);
    const one = t({ cells: [['x']] });
    expect(removeLine(one, 'col', 0).cells).toEqual([['x']]);
  });
  it('moves a column with its words, styles, and width', () => {
    const e = moveLine(t({ colw: [0.5, 0.25, 0.25], cruns: [[[{ s: 0, e: 1, w: 700 }], null, null], [null, null, null], [null, null, null]] } as Partial<El>), 'col', 0, 2);
    expect(e.cells![0]).toEqual(['b', 'c', 'a']);
    expect(e.colw).toEqual([0.25, 0.25, 0.5]);
    expect(e.cruns![0][2]).toEqual([{ s: 0, e: 1, w: 700 }]);
    expect(e.cruns![0][0]).toBeNull();
  });
  it('keeps styled words in their cells when a row is removed', () => {
    const e = removeLine(t({ cruns: [[null, null, null], [[{ s: 0, e: 1, c: '#e5484d' }], null, null], [null, null, null]] } as Partial<El>), 'row', 0);
    expect(e.cruns![0][0]).toEqual([{ s: 0, e: 1, c: '#e5484d' }]);
  });
  it('lays rows out by their shares and finds cells in them', () => {
    const e = t({ rowh: [0.5, 0.25, 0.25] });
    expect(cellBox(e, 1, 0)).toEqual({ x: 0, y: 60, w: 100, h: 30 });
    expect(cellAt(e, 10, 59)).toEqual([0, 0]);
    expect(cellAt(e, 10, 61)).toEqual([1, 0]);
    expect(edgesOf(rowFractions(e))).toEqual([0, 0.5, 0.75, 1]);
  });
});
