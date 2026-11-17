import { describe, it, expect } from 'vitest';
import { regionOf, combine, subsOfRegion, strokeRegion, outlineOf, refitRing } from '../src/boolean';
import { rectPath, mapPaths, bounds, ellipsePath } from '../src/vector';
import type { El } from '../src/types';

const sq = (x: number, y: number, s = 100) => mapPaths(rectPath(s, s), (a, b) => [a + x, b + y]);
const area = (ring: number[][]) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a) / 2; };
const total = (mp: number[][][][]) => mp.reduce((s, poly) => s + area(poly[0]) - poly.slice(1).reduce((h, r) => h + area(r), 0), 0);

describe('booleans', () => {
  const a = regionOf(sq(0, 0)), b = regionOf(sq(50, 50));
  it('unions, subtracts, intersects, and excludes', () => {
    expect(total(combine('union', [a, b]))).toBeCloseTo(17500, 0);
    expect(total(combine('subtract', [a, b]))).toBeCloseTo(7500, 0);
    expect(total(combine('intersect', [a, b]))).toBeCloseTo(2500, 0);
    expect(total(combine('exclude', [a, b]))).toBeCloseTo(15000, 0);
  });
  it('treats overlapping rings in one piece as holes', () => {
    const donut = regionOf([...sq(0, 0), ...sq(25, 25, 50)]);
    expect(total(donut)).toBeCloseTo(7500, 0);
    expect(subsOfRegion(donut).length).toBe(2);
  });
  it('turns regions back into closed corner paths', () => {
    const subs = subsOfRegion(combine('union', [a, b]));
    expect(subs.length).toBe(1);
    expect(subs[0].nodes.length).toBe(8);
    expect(subs[0].nodes.every(n => n.ix == null)).toBe(true);
    expect(bounds(subs)).toMatchObject({ x: 0, y: 0, w: 150, h: 150 });
  });
  it('refits flattened curves as smooth nodes', () => {
    const ring = regionOf(ellipsePath(200, 200))[0][0], sp = refitRing(ring)!;
    expect(sp.nodes.length).toBeLessThan(ring.length);
    expect(sp.nodes.filter(n => n.s).length).toBeGreaterThan(sp.nodes.length / 2);
  });
  it('outlines a stroke', () => {
    const line = [{ nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], reg = strokeRegion(line, 10);
    // A 100 by 10 band plus two half-disc caps.
    expect(total(reg)).toBeGreaterThan(1000); expect(total(reg)).toBeLessThan(1000 + Math.PI * 25 + 5);
  });
  it('reads piece outlines with rotation', () => {
    const e = { id: 'r', type: 'rect', z: 1, x: 0, y: 0, w: 100, h: 20, rot: 90 } as El;
    const b2 = bounds(outlineOf(e))!;
    expect(b2.w).toBeCloseTo(20, 0); expect(b2.h).toBeCloseTo(100, 0);
  });
});
