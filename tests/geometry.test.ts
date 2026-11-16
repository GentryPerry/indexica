import { beforeAll, describe, expect, it } from 'vitest';
import { bbox, bounds, ends, fitText, setMeasurer, wrap } from '../src/geometry';
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
