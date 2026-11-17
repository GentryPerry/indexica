import { describe, it, expect, beforeAll } from 'vitest';
import { init, ready } from '../src/pathops';
import * as X from '../src/exact';
import { rectPath, ellipsePath, mapPaths, bounds } from '../src/vector';

const sq = (x: number, y: number, s = 100) => mapPaths(rectPath(s, s), (a, b) => [a + x, b + y]);

describe('VectorCraft engine', () => {
  beforeAll(async () => { await init(); });
  it('loads from the bytes built into the page', () => expect(ready()).toBe(true));
  it('unions overlapping squares into one outline', () => {
    const r = X.combine('union', [{ subs: sq(0, 0) }, { subs: sq(50, 50) }])!;
    expect(r.length).toBe(1); expect(r[0].nodes.length).toBe(8);
    expect(bounds(r)).toMatchObject({ x: 0, y: 0, w: 150, h: 150 });
  });
  it('subtracts later pieces from the first', () => {
    const r = X.combine('subtract', [{ subs: sq(0, 0) }, { subs: sq(50, 50) }])!;
    expect(r[0].nodes.length).toBe(6);
  });
  it('keeps circles as curves rather than many short lines', () => {
    const c = mapPaths(ellipsePath(100, 100), (a, b) => [a + 50, b]);
    const r = X.combine('intersect', [{ subs: sq(0, 0) }, { subs: c }])!;
    expect(r[0].nodes.length).toBeLessThan(12);
    expect(r[0].nodes.some(n => n.ix != null || n.ox != null)).toBe(true);
  });
  it('returns nothing for pieces that do not touch', () => {
    expect(X.combine('intersect', [{ subs: sq(0, 0) }, { subs: sq(500, 500) }])).toEqual([]);
  });
  it('outlines a stroke with round caps', () => {
    const r = X.outlineStroke([{ nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], 10)!;
    const b = bounds(r)!; expect(b.w).toBeCloseTo(110, 0); expect(b.h).toBeCloseTo(10, 0);
  });
  it('offsets out and in', () => {
    expect(bounds(X.offset(sq(0, 0), 10)!)!.w).toBeCloseTo(120, 0);
    expect(bounds(X.offset(sq(0, 0), -10)!)!.w).toBeCloseTo(80, 0);
  });
  it('simplifies and smooths', () => {
    const wobbly = [{ nodes: [0, 10, 20, 30, 40].map((x, i) => ({ x, y: i % 2 ? 0.1 : 0 })) }];
    expect(X.simplify(wobbly, 1)![0].nodes.length).toBe(2);
    const jag = [{ nodes: [0, 10, 20, 30, 40, 50, 60].map((x, i) => ({ x, y: i % 2 ? 3 : 0 })) }];
    const sm = X.smooth(jag, 50)![0].nodes;
    expect(sm.length).toBeLessThanOrEqual(7); expect(sm.some(n => n.ox != null)).toBe(true);
    // VectorCraft's Smooth leaves shapes it cannot round, such as a square, as they are.
    expect(X.smooth(sq(0, 0), 50)![0].nodes.length).toBe(sq(0, 0)[0].nodes.length);
  });
  it('maps simplify levels like VectorCraft', () => {
    expect(X.simplifyTolerance(50)).toBe(1);
    expect(X.simplifyTolerance(40)).toBe(2);
    expect(X.simplifyTolerance(0)).toBe(32);
    expect(X.simplifyTolerance(100)).toBeCloseTo(1 / 32);
  });
});
