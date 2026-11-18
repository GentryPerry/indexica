import { describe, it, expect, beforeAll } from 'vitest';
import { gradientGeom, moveHandle, byAngle, type Gradient } from '../src/paint';
import { profileOutline } from '../src/brush';
import { eraseSubs } from '../src/vecerase';
import { init } from '../src/pathops';
import { bounds, rectPath, mapPaths } from '../src/vector';

const lin: Gradient = { kind: 'linear', angle: 0, stops: [[0, '#fff'], [1, '#000']] };

describe('gradient handles', () => {
  it('lays a linear gradient out by its angle until a handle moves', () => {
    expect(gradientGeom(lin)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    const g = moveHandle(lin, 'to', 0.5, 1);
    expect(gradientGeom(g)).toEqual({ x1: 0, y1: 0.5, x2: 0.5, y2: 1 });
    expect(g.angle).toBe(45);
    expect(gradientGeom(byAngle(g, 90))).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });
  it('moves a radial gradient\'s center and edge', () => {
    let g: Gradient = { ...lin, kind: 'radial' };
    expect(gradientGeom(g)).toEqual({ cx: 0.5, cy: 0.5, r: 0.5 });
    g = moveHandle(g, 'center', 0.25, 0.25);
    g = moveHandle(g, 'edge', 0.25, 0.75);
    expect(gradientGeom(g)).toEqual({ cx: 0.25, cy: 0.25, r: 0.5 });
  });
});

describe('stroke width profiles', () => {
  const line = Array.from({ length: 21 }, (_, i) => [i * 10, 0]);
  const widthAt = (o: number[][], x: number) => { const ys = o.filter(p => Math.abs(p[0] - x) < 6).map(p => p[1]); return ys.length ? Math.max(...ys) - Math.min(...ys) : 0; };
  it('tapers both ends but keeps the middle at full width', () => {
    const o = profileOutline(line, 10, 'taper');
    expect(widthAt(o, 100)).toBeGreaterThan(8);
    expect(widthAt(o, 5)).toBeLessThan(widthAt(o, 100));
  });
  it('tapers only the end it is asked to', () => {
    const o = profileOutline(line, 10, 'end');
    expect(widthAt(o, 10)).toBeGreaterThan(widthAt(o, 195));
  });
});

describe('vector eraser', () => {
  beforeAll(async () => { await init(); });
  const sq = mapPaths(rectPath(100, 100), (x, y) => [x, y]);
  it('misses shapes it does not touch', () => {
    expect(eraseSubs(sq, [[300, 300], [310, 300]], 5)).toBeNull();
  });
  it('bites a band out of a filled shape', () => {
    const out = eraseSubs(sq, [[-20, 50], [120, 50]], 5)!;
    expect(out.length).toBe(2);
    expect(bounds(out)!.h).toBeCloseTo(100, 0);
  });
  it('cuts an open stroke in two where it passes', () => {
    const line = [{ nodes: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }];
    const out = eraseSubs(line, [[100, -20], [100, 20]], 5, 2)!;
    expect(out.length).toBe(2);
    expect(Math.max(...out.map(sp => Math.max(...sp.nodes.map(n => n.x))))).toBe(200);
  });
});
