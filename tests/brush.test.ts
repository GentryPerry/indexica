import { describe, it, expect } from 'vitest';
import { brushOutline, outlineD, eraseStroke, touches, shaped } from '../src/brush';

const line = (n = 21) => Array.from({ length: n }, (_, i) => [i * 10, 0]);

describe('brushes', () => {
  it('builds a closed outline around a stroke', () => {
    const poly = brushOutline(line(), 10, 'brush');
    expect(poly.length).toBeGreaterThan(10);
    const ys = poly.map(p => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(6); expect(Math.min(...ys)).toBeGreaterThanOrEqual(-6);
    expect(outlineD(poly, 5, 5)).toMatch(/^M.*Z$/);
    expect(outlineD([[0, 0]])).toBe('');
  });
  it('uses real pressure when there is some', () => {
    const light = brushOutline(line().map(p => [...p, 0.1]), 10, 'pencil'), heavy = brushOutline(line().map(p => [...p, 1]), 10, 'pencil');
    const span = (poly: number[][]) => Math.max(...poly.map(p => p[1])) - Math.min(...poly.map(p => p[1]));
    expect(span(heavy)).toBeGreaterThan(span(light));
  });
  it('knows which brushes are shaped', () => {
    expect(shaped('brush')).toBe(true); expect(shaped('marker')).toBe(false); expect(shaped(undefined)).toBe(false);
  });
});

describe('stroke eraser', () => {
  it('splits a stroke where the eraser touches it', () => {
    const runs = eraseStroke(line(), 100, 0, 12);
    expect(runs.length).toBe(2);
    expect(runs[0].at(-1)![0]).toBeLessThan(100); expect(runs[1][0][0]).toBeGreaterThan(100);
  });
  it('drops runs that are too short and leaves untouched strokes whole', () => {
    expect(eraseStroke(line(), 0, 0, 12).length).toBe(1);
    expect(eraseStroke(line(3), 10, 0, 30)).toEqual([]);
    expect(touches(line(), 100, 50, 10)).toBe(false);
    expect(touches(line(), 100, 5, 10)).toBe(true);
  });
  it('cuts long segments that pass through the eraser', () => {
    const runs = eraseStroke([[0, 0], [10, 0], [200, 0], [210, 0]], 100, 0, 5);
    expect(runs.length).toBe(2);
  });
});
