import { describe, expect, it } from 'vitest';
import { adjustments, cropTo, fillBox, fullRect, panCrop, resetCrop, setWindow } from '../src/picture';
import { cellLook, shade, tint } from '../src/table';
import type { El } from '../src/types';

const pic = (extra: Partial<El> = {}): El => ({ id: 'p', type: 'image', z: 1, x: 100, y: 100, w: 400, h: 200, src: 'i', ...extra });

describe('picture crop', () => {
  it('keeps the whole image in place while the window changes', () => {
    const e = pic(), full = fullRect(e);
    expect(full).toEqual({ x: 100, y: 100, w: 400, h: 200 });
    setWindow(e, { x: 200, y: 100, w: 200, h: 100 }, full);
    expect(e.crop).toEqual([0.25, 0, 0.25, 0.5]);
    expect(fullRect(e)).toEqual(full);
  });
  it('keeps the window inside the image', () => {
    const e = pic(), full = fullRect(e);
    setWindow(e, { x: 0, y: 50, w: 900, h: 900 }, full);
    expect(e).toMatchObject({ x: 100, y: 100, w: 400, h: 200 });
    expect(e.crop).toBeUndefined();
  });
  it('pans the image under the window without passing its edges', () => {
    const e = pic(); setWindow(e, { x: 200, y: 100, w: 200, h: 100 }, fullRect(e));
    const full = fullRect(e);
    panCrop(e, 40, 0, full); expect(e.crop![0]).toBeCloseTo(0.15);
    panCrop(e, 1000, 1000, full); expect(e.crop).toEqual([0, 0, 0.5, 0.5]);
    expect(e.x).toBe(200);
  });
  it('crops to a ratio around the current window and resets', () => {
    const e = pic(); cropTo(e, 1);
    expect(e).toMatchObject({ x: 200, y: 100, w: 200, h: 200, crop: [0.25, 0, 0.25, 0] });
    resetCrop(e); expect(e).toMatchObject({ x: 100, w: 400, h: 200 }); expect(e.crop).toBeUndefined();
  });
  it('fills a box, cutting the overflow evenly', () => {
    const e = pic(); fillBox(e, { x: 0, y: 0, w: 300, h: 300 }, 2);
    expect(e).toMatchObject({ w: 300, h: 300, crop: [0.25, 0, 0.25, 0] });
    fillBox(e, { x: 0, y: 0, w: 200, h: 100 }, 2); expect(e.crop).toBeUndefined();
  });
  it('turns adjustments into filter values', () => {
    expect(adjustments(pic())).toBeNull();
    expect(adjustments(pic({ gray: true }))!.sat).toBe(0);
    const a = adjustments(pic({ contrast: 0.5, bright: 0.2 }))!;
    expect(a.slope).toBe(1.5); expect(a.intercept).toBeCloseTo(-0.25 + 0.1);
  });
});

describe('table styles', () => {
  const tbl = (extra: Partial<El>): El => ({ id: 't', type: 'table', z: 1, x: 0, y: 0, w: 300, h: 120, cells: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']], header: true, band: true, tstyle: 'medium2', tacc: '#2e6fd8', ...extra });
  it('tints and shades in linear light', () => {
    expect(tint('#000000', 0)).toBe('#ffffff');
    expect(tint('#2e6fd8', 1)).toBe('#2e6fd8');
    expect(shade('#ffffff', 0.5)).toBe('#bcbcbc');
  });
  it('marks the header, bands, and total row', () => {
    const t = tbl({ lastRow: true });
    expect(cellLook(t, 0, 0)).toMatchObject({ fill: '#2e6fd8', text: '#ffffff', bold: true });
    expect(cellLook(t, 1, 0).fill).toBe(tint('#2e6fd8', 0.4));
    expect(cellLook(t, 2, 0).fill).toBe(tint('#2e6fd8', 0.2));
    expect(cellLook(t, 3, 1).bold).toBe(true);
    expect(cellLook(tbl({ tstyle: 'none' }), 1, 1)).toEqual({ bold: false });
    expect(cellLook(tbl({ tstyle: 'dark1' }), 0, 0).fill).toBe('#000000');
    expect(cellLook(tbl({ tstyle: 'light2', firstCol: true }), 2, 0).bold).toBe(true);
  });
});
