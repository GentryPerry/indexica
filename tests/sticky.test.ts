import { describe, it, expect, beforeAll } from 'vitest';
import { fitText, textStyle, setMeasurer, STICKY_SIZES, STICKY_SIDE } from '../src/geometry';
import type { El } from '../src/types';

const note = (text: string, extra: Partial<El> = {}): El => ({ id: 's', type: 'sticky', x: 0, y: 0, w: STICKY_SIDE, h: STICKY_SIDE, z: 1, text, ...extra } as El);

describe('FigJam-style sticky notes', () => {
  beforeAll(() => setMeasurer((text, size) => text.length * size * 0.55));
  it('shows short text at the largest size', () => {
    const e = note('Hi'); fitText(e);
    expect(e.fit).toBe(STICKY_SIZES[0]); expect(textStyle(e).size).toBe(STICKY_SIZES[0]); expect(e.h).toBe(STICKY_SIDE);
  });
  it('shrinks text as it grows and keeps the note square', () => {
    const e = note('word '.repeat(40)); fitText(e);
    expect(e.fit!).toBeLessThan(STICKY_SIZES[0]); expect(e.h).toBe(STICKY_SIDE);
  });
  it('grows only when the smallest size does not fit', () => {
    const e = note('word '.repeat(400)); fitText(e);
    expect(e.fit).toBe(STICKY_SIZES[STICKY_SIZES.length - 1]); expect(e.h).toBeGreaterThan(STICKY_SIDE);
  });
  it('keeps a size picked by hand and grows instead', () => {
    const e = note('word '.repeat(60), { size: 20, fit: 24 }); fitText(e);
    expect(e.fit).toBeUndefined(); expect(textStyle(e).size).toBe(20); expect(e.h).toBeGreaterThan(STICKY_SIDE);
  });
  it('leaves room for the author name', () => {
    const t = 'word '.repeat(30), a = note(t), b = note(t, { author: 'u1' });
    fitText(a); fitText(b);
    expect(b.fit!).toBeLessThanOrEqual(a.fit!);
  });
});
