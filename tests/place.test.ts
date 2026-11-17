import { describe, it, expect } from 'vitest';
import { placeWorldPaths, setWorldPaths, worldPaths, type SubPath } from '../src/vector';
import type { El } from '../src/types';

const drawn = (e: El, x: number, y: number) => {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, a = ((e.rot || 0) * Math.PI) / 180;
  return [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
};

describe('placing changed geometry on a rotated vector', () => {
  it('keeps unchanged points where they were drawn', () => {
    const e = { id: 'a', type: 'path', x: 0, y: 0, w: 0, h: 0, z: 1, rot: 40 } as El;
    setWorldPaths(e, [{ nodes: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }], closed: true }]);
    const before = drawn(e, 0, 0);
    // Drop the far corner: the box shrinks, the corner at (0, 0) does not move.
    const subs: SubPath[] = [{ nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], closed: true }];
    placeWorldPaths(e, subs);
    const w = worldPaths(e)[0].nodes[0], after = drawn(e, w.x, w.y);
    expect(after[0]).toBeCloseTo(before[0], 1); expect(after[1]).toBeCloseTo(before[1], 1);
  });
  it('matches setWorldPaths when not rotated', () => {
    const a = { id: 'a', type: 'path', x: 0, y: 0, w: 0, h: 0, z: 1 } as El, b = { ...a };
    const subs: SubPath[] = [{ nodes: [{ x: 5, y: 5 }, { x: 50, y: 9 }] }];
    setWorldPaths(a, subs); placeWorldPaths(b, subs);
    expect(b).toEqual(a);
  });
});
