import { describe, expect, it } from 'vitest';
import { pinchCam, movedPast, Touches, MAX_Z, MIN_Z } from '../src/touch';
import { History } from '../src/history';
import type { El, Els } from '../src/types';

const world = (cam: { x: number; y: number; z: number }, p: { x: number; y: number }) => ({ x: (p.x - cam.x) / cam.z, y: (p.y - cam.y) / cam.z });

describe('pinchCam', () => {
  const start = { cam: { x: 50, y: 20, z: 1 }, a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };

  it('leaves the camera alone when the fingers have not moved', () => {
    expect(pinchCam(start, start.a, start.b)).toEqual(start.cam);
  });

  it('pans with both fingers when their spread is unchanged', () => {
    const c = pinchCam(start, { x: 130, y: 140 }, { x: 230, y: 140 });
    expect(c).toEqual({ x: 80, y: 60, z: 1 });
  });

  it('zooms by the change in spread and keeps the midpoint over the same board point', () => {
    const before = world(start.cam, { x: 150, y: 100 });
    const c = pinchCam(start, { x: 50, y: 100 }, { x: 250, y: 100 });
    expect(c.z).toBeCloseTo(2);
    const after = world(c, { x: 150, y: 100 });
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  });

  it('follows a moving midpoint while zooming', () => {
    const before = world(start.cam, { x: 150, y: 100 });
    const c = pinchCam(start, { x: 300, y: 300 }, { x: 350, y: 300 });
    expect(c.z).toBeCloseTo(0.5);
    const after = world(c, { x: 325, y: 300 });
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps the zoom', () => {
    expect(pinchCam(start, { x: 0, y: 100 }, { x: 10000, y: 100 }).z).toBe(MAX_Z);
    expect(pinchCam(start, { x: 150, y: 100 }, { x: 151, y: 100 }).z).toBe(MIN_Z);
  });

  it('survives fingers that start on the same spot', () => {
    const c = pinchCam({ ...start, b: start.a }, start.a, { x: 110, y: 100 });
    expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
  });
});

describe('movedPast', () => {
  it('tells a tap from a drag', () => {
    expect(movedPast({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
    expect(movedPast({ x: 0, y: 0 }, { x: 12, y: 0 })).toBe(true);
    expect(movedPast({ x: 0, y: 0 }, { x: 4, y: 0 }, 3)).toBe(true);
  });
});

describe('Touches', () => {
  it('tracks fingers in the order they went down', () => {
    const t = new Touches();
    t.down(7, { x: 1, y: 1 }); expect(t.pair()).toBeNull();
    t.down(3, { x: 5, y: 5 }); t.down(9, { x: 9, y: 9 });
    expect(t.count).toBe(3);
    expect(t.pair()).toEqual([{ x: 1, y: 1 }, { x: 5, y: 5 }]);
    expect(t.move(3, { x: 6, y: 6 })).toBe(true);
    expect(t.move(4, { x: 0, y: 0 })).toBe(false);
    t.up(7);
    expect(t.pair()).toEqual([{ x: 6, y: 6 }, { x: 9, y: 9 }]);
    t.clear(); expect(t.count).toBe(0);
  });
});

describe('History.revert', () => {
  const el = (id: string, x = 0): El => ({ id, type: 'rect', z: 1, x, y: 0, w: 10, h: 10 });

  it('drops uncommitted moves, adds, and removals', () => {
    const els: Els = { a: el('a'), b: el('b') }, hist = new History();
    hist.reset(els);
    els.a.x = 99; els.c = el('c'); delete els.b;
    const changed = hist.revert(els);
    expect(changed.sort()).toEqual(['a', 'b', 'c']);
    expect(els.a.x).toBe(0); expect(els.b).toBeDefined(); expect(els.c).toBeUndefined();
    expect(hist.undo).toHaveLength(0);
  });

  it('only touches the given ids', () => {
    const els: Els = { a: el('a'), b: el('b') }, hist = new History();
    hist.reset(els);
    els.a.x = 5; els.b.x = 6;
    expect(hist.revert(els, ['a'])).toEqual(['a']);
    expect(els.a.x).toBe(0); expect(els.b.x).toBe(6);
  });
});
