import { beforeAll, describe, expect, it } from 'vitest';
import { bbox, bounds, ends, fitText, normAngle, resizeBox, rotateEl, rotatedBox, rotatePoint, snapAngle, setMeasurer, wrap } from '../src/geometry';
import type { El } from '../src/types';

const el = (p: Partial<El>): El => ({ id: 'x', type: 'rect', z: 1, x: 0, y: 0, w: 100, h: 100, ...p });
const lookup = (list: El[]) => (id: string) => list.find(e => e.id === id);

// Every character is 10px wide, so wrapping is easy to reason about.
beforeAll(() => setMeasurer(text => text.length * 10));

describe('wrap', () => {
  it('keeps short text on one line', () => expect(wrap('hello', 100, 16)).toEqual(['hello']));
  it('breaks between words', () => expect(wrap('one two three', 70, 16)).toEqual(['one two', 'three']));
  it('splits a word that is wider than the line', () => expect(wrap('abcdefgh', 30, 16)).toEqual(['abc', 'def', 'gh']));
  it('keeps blank lines', () => expect(wrap('a\n\nb', 100, 16)).toEqual(['a', '', 'b']));
  it('returns one empty line for empty text', () => expect(wrap('', 100, 16)).toEqual(['']));
});

describe('connectors', () => {
  const a = el({ id: 'a', x: 0, y: 0 }), b = el({ id: 'b', x: 300, y: 0 });
  const c = el({ id: 'c', type: 'conn', a: 'a', b: 'b', ax: 0, ay: 0, bx: 0, by: 0 });
  it('stop just outside the shapes they attach to', () => {
    const [p, q] = ends(c, lookup([a, b]));
    expect(p).toMatchObject({ x: 105, y: 50 });
    expect(q).toMatchObject({ x: 295, y: 50 });
  });
  it('follow a shape when it moves', () => {
    const moved = { ...b, y: 400 };
    const [, q] = ends(c, lookup([a, moved]));
    expect(q.y).toBeGreaterThan(300);
  });
  it('fall back to free points when nothing is attached', () => {
    const free = el({ type: 'conn', a: null, b: null, ax: 10, ay: 20, bx: 110, by: 70 });
    expect(bbox(free, lookup([]))).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
  it('clip to an ellipse edge, not its bounding box', () => {
    const round = el({ id: 'a', type: 'ellipse' }), far = el({ id: 'b', x: 300, y: 300 });
    const [p] = ends(c, lookup([round, far]));
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(55, 5);
  });
});

describe('bounds', () => {
  it('is null for an empty list', () => expect(bounds([], lookup([]))).toBeNull());
  it('covers every element', () => {
    const list = [el({ x: -10, y: 5, w: 20, h: 20 }), el({ x: 100, y: 100, w: 50, h: 10 })];
    expect(bounds(list, lookup(list))).toEqual({ x: -10, y: 5, w: 160, h: 105 });
  });
});

describe('fitText', () => {
  it('grows a sticky note so text is not clipped', () => {
    const note = el({ type: 'sticky', w: 124, h: 40, text: 'aaaaaaaaa bbbbbbbbb ccccccccc ddddddddd' });
    fitText(note);
    expect(note.h).toBe(Math.ceil(4 * 20.8 + 24));
  });
  it('never shrinks a shape', () => {
    const box = el({ h: 200, text: 'hi' });
    fitText(box);
    expect(box.h).toBe(200);
  });
});

describe('rotation', () => {
  it('a 90 degree turn swaps the outer width and height', () => {
    const b = rotatedBox({ x: 0, y: 0, w: 100, h: 40 }, 90);
    expect(b.w).toBeCloseTo(40); expect(b.h).toBeCloseTo(100);
    expect(b.x).toBeCloseTo(30); expect(b.y).toBeCloseTo(-30);
  });
  it('bbox of a rotated element contains its corners', () => {
    const b = bbox(el({ w: 100, h: 100, rot: 45 }), lookup([]));
    expect(b.w).toBeCloseTo(Math.SQRT2 * 100);
  });
  it('connectors clip to the rotated shape', () => {
    const tall = el({ id: 'a', x: 0, y: 0, w: 40, h: 200, rot: 90 }), far = el({ id: 'b', x: 500, y: 50 });
    const c = el({ id: 'c', type: 'conn', a: 'a', b: 'b' });
    const [p] = ends(c, lookup([tall, far]));
    // Turned on its side, the shape reaches 100 (+5 gap) to the right of its center at x = 20.
    expect(p.x).toBeCloseTo(125); expect(p.y).toBeCloseTo(100);
  });
  it('snapAngle settles on 45s when close and wraps past 180', () => {
    expect(snapAngle(1.4, false)).toBe(0);
    expect(snapAngle(88, false)).toBe(90);
    expect(snapAngle(30.4, false)).toBe(30);
    expect(snapAngle(190, false)).toBe(-170);
    expect(snapAngle(-180, false)).toBe(180);
  });
  it('snapAngle steps by 15 when asked', () => expect(snapAngle(22, true)).toBe(15));
  it('normAngle keeps angles in (-180, 180]', () => {
    expect(normAngle(270)).toBe(-90);
    expect(normAngle(-450)).toBe(-90);
    expect(normAngle(360)).toBe(0);
  });
});

describe('rotating a selection', () => {
  it('rotatePoint turns clockwise on screen', () => {
    const p = rotatePoint(10, 0, 0, 0, 90);
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(10);
  });
  it('a piece orbits the pivot and turns by the same angle', () => {
    const r = rotateEl(el({ x: 100, y: -10, w: 40, h: 20, rot: 10 }), 0, 0, 90);
    // Center (120, 0) moves to (0, 120).
    expect(r.x).toBeCloseTo(-20); expect(r.y).toBeCloseTo(110);
    expect(r.rot).toBe(100);
    expect([r.w, r.h]).toEqual([40, 20]);
  });
  it('turning back restores the original', () => {
    const o = el({ x: 33, y: 71, w: 120, h: 45, rot: 20 });
    const back = rotateEl(rotateEl(o, 200, 150, 37), 200, 150, -37);
    expect(back.x).toBeCloseTo(o.x, 1); expect(back.y).toBeCloseTo(o.y, 1); expect(back.rot).toBe(20);
  });
  it('drops the rot field when the result is upright', () => {
    expect('rot' in rotateEl(el({ rot: -30 }), 50, 50, 30)).toBe(false);
  });
  it('turns a connector\'s free end points and leaves the original untouched', () => {
    const c = el({ type: 'conn', a: null, b: null, ax: 10, ay: 0, bx: 20, by: 0 });
    const r = rotateEl(c, 0, 0, 180);
    expect([r.ax, r.ay, r.bx, r.by]).toEqual([-10, 0, -20, 0]);
    expect(c.ax).toBe(10);
  });
});

describe('resizeBox', () => {
  const box = { x: 0, y: 0, w: 100, h: 60 };
  it('dragging the east handle only changes width', () => {
    expect(resizeBox(box, 'e', 25, 40, 30)).toEqual({ x: 0, y: 0, w: 125, h: 60 });
  });
  it('dragging the north-west corner keeps the opposite corner fixed', () => {
    const r = resizeBox(box, 'nw', 10, 20, 30);
    expect(r).toEqual({ x: 10, y: 20, w: 90, h: 40 });
  });
  it('never goes below the minimum size', () => {
    expect(resizeBox(box, 'w', 500, 0, 30).w).toBe(30);
  });
  it('keeps the opposite corner fixed on a rotated box', () => {
    const o = { ...box, rot: 30 }, rad = 30 * Math.PI / 180;
    // World position of a local corner (lx, ly measured from the box center).
    const corner = (b: typeof box, lx: number, ly: number) => ({
      x: b.x + b.w / 2 + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: b.y + b.h / 2 + lx * Math.sin(rad) + ly * Math.cos(rad),
    });
    const before = corner(o, -o.w / 2, -o.h / 2);
    const r = resizeBox(o, 'se', 37, 11, 30);
    const after = corner(r, -r.w / 2, -r.h / 2);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  });
});
