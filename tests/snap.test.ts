import { describe, expect, it } from 'vitest';
import { snapMove, snapPoint } from '../src/snap';

const other = { x: 100, y: 100, w: 100, h: 50 };

describe('snapMove', () => {
  it('does nothing when no edge is within range', () => {
    expect(snapMove({ x: 400, y: 400, w: 50, h: 50 }, [other], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('lines up left edges and draws a vertical guide across both boxes', () => {
    const r = snapMove({ x: 104, y: 300, w: 40, h: 40 }, [other], 6);
    expect(r.dx).toBe(-4);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'x', pos: 100, from: 100, to: 340 }]);
  });
  it('lines up centers', () => {
    const r = snapMove({ x: 127, y: 300, w: 40, h: 40 }, [other], 6);
    expect(r.dx).toBe(3);
    expect(r.guides[0].pos).toBe(150);
  });
  it('snaps a left edge to a neighbor\'s right edge', () => {
    expect(snapMove({ x: 203, y: 300, w: 40, h: 40 }, [other], 6).dx).toBe(-3);
  });
  it('snaps both axes at once', () => {
    const r = snapMove({ x: 98, y: 153, w: 40, h: 40 }, [other], 6);
    expect([r.dx, r.dy]).toEqual([2, -3]);
    expect(r.guides.map(g => g.axis).sort()).toEqual(['x', 'y']);
  });
  it('picks the closest of several candidates', () => {
    const r = snapMove({ x: 95, y: 300, w: 40, h: 40 }, [other, { x: 93, y: 0, w: 10, h: 10 }], 6);
    expect(r.dx).toBe(-2);
  });
});

describe('snapPoint', () => {
  it('returns null when nothing is close', () => expect(snapPoint(50, 'x', [other], 6, [0, 10])).toBeNull());
  it('snaps a dragged edge and reports the guide', () => {
    expect(snapPoint(197, 'x', [other], 6, [300, 340])).toEqual({ v: 200, guide: { axis: 'x', pos: 200, from: 100, to: 340 } });
  });
});
