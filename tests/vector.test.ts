import { describe, it, expect } from 'vitest';
import { pathD, bounds, nearest, splitSegment, removeNodes, dragHandle, setSmooth, rectPath, ellipsePath, smoothThrough, simplify, flatten, fromRings, setWorldPaths, worldPaths, normalize, moveNode, type SubPath } from '../src/vector';
import type { El } from '../src/types';

const tri = (): SubPath[] => [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }] }];

describe('vector paths', () => {
  it('writes path data', () => {
    expect(pathD(tri())).toBe('M0 0L100 0L50 80Z');
    expect(pathD([{ nodes: [{ x: 0, y: 0, ox: 10, oy: 0 }, { x: 20, y: 20 }] }], 5, 5)).toBe('M5 5C15 5 25 25 25 25');
  });
  it('measures curves tightly', () => {
    const b = bounds(ellipsePath(200, 100))!;
    expect(b.x).toBeCloseTo(0, 1); expect(b.w).toBeCloseTo(200, 1); expect(b.h).toBeCloseTo(100, 1);
    // A bulging curve extends past its end nodes but not out to its handles.
    const arc = bounds([{ nodes: [{ x: 0, y: 0, ox: 0, oy: -40 }, { x: 100, y: 0, ix: 100, iy: -40 }] }])!;
    expect(arc.y).toBeCloseTo(-30, 0); expect(arc.y).toBeGreaterThan(-40);
  });
  it('finds the nearest point and splits there without changing the shape', () => {
    const subs = ellipsePath(200, 100), hit = nearest(subs, 200, 50)!;
    expect(hit.d).toBeLessThan(0.5);
    const before = bounds(subs)!, idx = splitSegment(subs, 0, 0, 0.5);
    expect(subs[0].nodes.length).toBe(5); expect(idx).toBe(1);
    const after = bounds(subs)!;
    expect(after.w).toBeCloseTo(before.w, 1); expect(after.h).toBeCloseTo(before.h, 1);
    const line = tri(); splitSegment(line, 0, 0, 0.25);
    expect(line[0].nodes[1]).toEqual({ x: 25, y: 0 });
  });
  it('removes nodes and drops subpaths that become too short', () => {
    expect(removeNodes(tri(), [[0, 1]])[0].nodes.length).toBe(2);
    expect(removeNodes(tri(), [[0, 1], [0, 2]])).toEqual([]);
  });
  it('keeps smooth handles in line', () => {
    const n = { x: 0, y: 0, ix: -10, iy: 0, ox: 20, oy: 0, s: true };
    dragHandle(n, 'o', 0, 30);
    expect(n.ix).toBeCloseTo(0); expect(n.iy).toBeCloseTo(-10);
    dragHandle(n, 'o', 30, 30, true);
    expect(n.s).toBeUndefined(); expect(n.iy).toBeCloseTo(-10);
  });
  it('toggles corners and smooth nodes', () => {
    const subs = tri(); setSmooth(subs[0], 1, true);
    const n = subs[0].nodes[1];
    expect(n.s).toBe(true); expect(n.ix).toBeDefined(); expect(n.ox).toBeDefined();
    setSmooth(subs[0], 1, false); expect(n.ix).toBeUndefined();
  });
  it('moves a node with its handles', () => {
    const n = { x: 1, y: 1, ix: 0, iy: 0, ox: 2, oy: 2 }; moveNode(n, 5, 5);
    expect(n).toMatchObject({ x: 6, ix: 5, ox: 7 });
  });
  it('builds shapes', () => {
    expect(rectPath(100, 50)[0].nodes.length).toBe(4);
    expect(bounds(rectPath(100, 50, 10))!.w).toBeCloseTo(100, 1);
    const sp = smoothThrough([[0, 0], [50, 40], [100, 0]]);
    expect(sp.nodes[1].s).toBe(true);
  });
  it('simplifies and flattens', () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0]], 0.1)).toEqual([[0, 0], [3, 0]]);
    expect(flatten(tri()[0]).length).toBe(3);
    expect(flatten(ellipsePath(100, 100)[0], 2).length).toBeGreaterThan(20);
    expect(fromRings([[[0, 0], [10, 0], [20, 0], [20, 10], [0, 0]]])[0].nodes.length).toBe(3);
  });
  it('stores paths relative to a fitted box and bakes stretch and rotation', () => {
    const e = { id: 'p', type: 'path', z: 1, x: 0, y: 0, w: 0, h: 0 } as El;
    setWorldPaths(e, mapTri(10, 20));
    expect([e.x, e.y, e.w, e.h, e.vw, e.vh]).toEqual([10, 20, 100, 80, 100, 80]);
    e.w = 200; // stretched
    expect(worldPaths(e)[0].nodes[1]).toMatchObject({ x: 210, y: 20 });
    normalize(e); expect(e.vw).toBe(200);
    e.rot = 90; normalize(e);
    expect(e.rot).toBeUndefined(); expect(e.w).toBeCloseTo(80, 1); expect(e.h).toBeCloseTo(200, 1);
  });
});

function mapTri(dx: number, dy: number): SubPath[] {
  return tri().map(sp => ({ ...sp, nodes: sp.nodes.map(n => ({ x: n.x + dx, y: n.y + dy })) }));
}
