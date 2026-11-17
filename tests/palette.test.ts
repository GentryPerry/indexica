import { describe, it, expect } from 'vitest';
import { hexToOklch, oklchToHex, paintFill, outlineFor, inkOn, autoInk, chip, lightness, INK } from '../src/palette';

describe('oklch', () => {
  it('round-trips colors', () => {
    for (const hex of ['#ffffff', '#000000', '#ffe27a', '#2447d6', '#b9e6c9', '#e5484d']) expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
  });
  it('reads known values', () => {
    expect(hexToOklch('#ffffff')![0]).toBeCloseTo(1, 3);
    expect(hexToOklch('#000000')![0]).toBeCloseTo(0, 3);
    expect(hexToOklch('nope')).toBeNull();
  });
  it('clips out-of-gamut colors by chroma', () => {
    const hex = oklchToHex([0.7, 0.5, 30]);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexToOklch(hex)![0]).toBeCloseTo(0.7, 1);
  });
});

describe('board paint', () => {
  it('keeps the light look as stored', () => {
    expect(paintFill('#ffe27a', 'light')).toBe('#ffe27a');
    expect(paintFill(undefined, 'dark')).toBeUndefined();
  });
  it('turns white into a dark surface and dims pastels in the dark theme', () => {
    expect(lightness(paintFill('#ffffff', 'dark')!)).toBeLessThan(0.35);
    const y = lightness(paintFill('#ffe27a', 'dark')!);
    expect(y).toBeGreaterThan(0.78); expect(y).toBeLessThan(lightness('#ffe27a'));
    expect(paintFill('#2f6fed', 'dark')).toBe('#2f6fed');
  });
  it('derives outlines from the fill', () => {
    const o = hexToOklch(outlineFor('#b5d8ff', 'light'))!, f = hexToOklch('#b5d8ff')!;
    expect(o[0]).toBeLessThan(0.6);
    expect(Math.abs(o[2] - f[2])).toBeLessThan(8);
    const y = hexToOklch(outlineFor('#ffe27a', 'light'))!; expect(y[2]).toBeLessThan(hexToOklch('#ffe27a')![2] - 15);
    expect(outlineFor('#ffffff', 'light')).toBe('#5b6679');
  });
  it('picks readable text', () => {
    expect(inkOn('#ffffff', undefined, 'light')).toBe(INK.dark);
    expect(inkOn(paintFill('#ffffff', 'dark'), INK.dark, 'dark')).toBe(INK.light);
    expect(inkOn('#ffffff', '#e5484d', 'dark')).toBe('#e5484d');
    expect(autoInk('#1D2530')).toBe(true);
  });
  it('makes soft chips', () => {
    const c = chip('#2a9460', 'light');
    expect(lightness(c.bg)).toBeGreaterThan(0.9);
    expect(lightness(c.text)).toBeLessThan(0.5);
  });
});
