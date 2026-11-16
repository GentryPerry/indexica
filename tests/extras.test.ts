import { beforeAll, describe, expect, it } from 'vitest';
import { monthGrid, monthPrefix, shiftMonth } from '../src/calendar';
import { fitText, setMeasurer, textStyle } from '../src/geometry';
import { STICKERS, TAPES, tapeOutline, tapePattern } from '../src/stickers';
import { FONTS, type El } from '../src/types';

const el = (p: Partial<El>): El => ({ id: 'x', type: 'sticky', z: 1, x: 0, y: 0, w: 100, h: 100, ...p });

describe('calendar', () => {
  it('lays November 2026 out in weeks starting Sunday', () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(6);
    expect(g[0]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(g[5][6]).toBe('2026-12-12');
  });
  it('pads the first week with the previous month', () => {
    expect(monthGrid(2026, 11)[0][0]).toBe('2026-11-29');
  });
  it('moves across year boundaries', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthPrefix(2026, 0)).toBe('2026-01');
  });
});

describe('text style', () => {
  beforeAll(() => setMeasurer((text, size) => text.length * size * 0.5));
  it('uses the type default until a choice is made', () => {
    expect(textStyle(el({}))).toEqual({ size: 16, weight: 400, family: FONTS.sans.stack, italic: false });
    expect(textStyle(el({ type: 'card' })).weight).toBe(600);
  });
  it('applies font, weight, size, and italic choices', () => {
    expect(textStyle(el({ font: 'serif', weight: 700, size: 32, italic: true }))).toEqual({ size: 32, weight: 700, family: FONTS.serif.stack, italic: true });
  });
  it('falls back to sans for an unknown font', () => {
    expect(textStyle(el({ font: 'nope' })).family).toBe(FONTS.sans.stack);
  });
  it('a bigger size makes a note grow to fit its text', () => {
    const small = el({ w: 200, h: 40, text: 'one two three four five six' }), big = { ...small, size: 32 };
    fitText(small); fitText(big);
    expect(big.h).toBeGreaterThan(small.h);
  });
});

describe('stickers and tape', () => {
  it('every sticker has a colored layer and closed shapes', () => {
    for (const def of Object.values(STICKERS)) {
      expect(def.layers.some(l => l.paint === 'fill')).toBe(true);
      for (const l of def.layers) if (l.paint !== 'line') expect(l.d.trim().endsWith('Z')).toBe(true);
    }
  });
  it('tape outline is closed and keeps its corners', () => {
    const d = tapeOutline(10, 20, 200, 30);
    expect(d.startsWith('M10.0 20.0L210.0 20.0')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).toContain('L10.0 50.0');
  });
  it('each pattern draws marks, except solid', () => {
    for (const k of Object.keys(TAPES)) expect(tapePattern(k, 0, 0, 200, 30).d.length > 0).toBe(k !== 'solid');
    expect(tapePattern('dots', 0, 0, 200, 30).filled).toBe(true);
  });
});
