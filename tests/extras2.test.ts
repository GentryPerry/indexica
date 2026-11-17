import { describe, expect, it } from 'vitest';
import { buildPdf } from '../src/pdf';
import { densify, hashId, roughPath, shapeOutline } from '../src/sketch';
import { cellAt, cellBox, colFractions, emptyCells, resizeCols, sharesWithCol, sharesWithoutCol } from '../src/table';
import type { El } from '../src/types';

const table = (p: Partial<El> = {}): El => ({ id: 't', type: 'table', z: 1, x: 0, y: 0, w: 400, h: 100, cells: emptyCells(2, 4), ...p });

describe('table column widths', () => {
  it('defaults to equal columns', () => expect(colFractions(table())).toEqual([0.25, 0.25, 0.25, 0.25]));
  it('ignores widths that do not match the column count', () => expect(colFractions(table({ colw: [1, 1] }))).toEqual([0.25, 0.25, 0.25, 0.25]));
  it('moves the border between two columns and keeps a minimum', () => {
    const m = resizeCols([0.25, 0.25, 0.25, 0.25], 0, 0.1);
    [0.35, 0.15, 0.25, 0.25].forEach((v, i) => expect(m[i]).toBeCloseTo(v));
    const r = resizeCols([0.25, 0.25, 0.25, 0.25], 0, 0.5, 0.06);
    expect(r[1]).toBeCloseTo(0.06); expect(r[0]).toBeCloseTo(0.44);
  });
  it('places cells by their column widths', () => {
    const t = table({ colw: [0.4, 0.2, 0.2, 0.2] });
    expect(cellBox(t, 0, 1)).toEqual({ x: 160, y: 0, w: 80, h: 50 });
    expect(cellAt(t, 150, 10)).toEqual([0, 0]);
    expect(cellAt(t, 170, 10)).toEqual([0, 1]);
  });
  it('makes room for a new column and spreads a removed one back', () => {
    const add = sharesWithCol([0.5, 0.5], 2);
    expect(add.map(v => Math.round(v * 300) / 300)).toEqual([1 / 3, 1 / 3, 1 / 3].map(v => Math.round(v * 300) / 300));
    expect(sharesWithoutCol([0.5, 0.25, 0.25], 0)).toEqual([0.5, 0.5]);
  });
});

describe('hand-drawn outlines', () => {
  it('is the same every time for the same piece', () => {
    const pts = shapeOutline('rect', 0, 0, 100, 60);
    expect(roughPath(pts, hashId('abc'), 2)).toBe(roughPath(pts, hashId('abc'), 2));
    expect(roughPath(pts, hashId('abc'), 2)).not.toBe(roughPath(pts, hashId('abd'), 2));
  });
  it('draws two strokes', () => expect((roughPath(shapeOutline('diamond', 0, 0, 80, 80), 7, 2).match(/M/g) || []).length).toBe(2));
  it('adds points along long edges', () => {
    const d = densify([{ x: 0, y: 0 }, { x: 100, y: 0 }], 25);
    expect(d).toHaveLength(5);
    expect(d[2]).toEqual({ x: 50, y: 0 });
  });
  it('closes shapes back to the start', () => {
    for (const k of ['rect', 'ellipse', 'diamond']) { const o = shapeOutline(k, 0, 0, 50, 40); expect(o[0]).toEqual(o[o.length - 1]); }
  });
});

describe('PDF export', () => {
  const page = (n: number) => ({ jpeg: new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]), px: 10, py: 5, w: 400, h: 200 });
  const pdf = buildPdf([page(1), page(2)]), text = new TextDecoder('latin1').decode(pdf);
  it('is a PDF with one page per image', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('has a cross-reference table that points at each object', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const offs = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    expect(offs).toHaveLength(8);
    offs.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
