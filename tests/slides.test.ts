import { describe, it, expect, beforeAll } from 'vitest';
import { setMeasurer } from '../src/geometry';
import { slidesOf, renumber, moveSlide, setSlide, slideMembers, nextSlideSpot, newSlide, sizeOf, darkBg } from '../src/slides';
import { LAYOUTS } from '../src/deck';
import type { El } from '../src/types';

const frame = (id: string, x: number, slide?: number, z = 1): El => ({ id, type: 'frame', z, x, y: 0, w: 1280, h: 720, slide });
const page = () => {
  const els: Record<string, El> = {};
  for (const e of [frame('a', 0, 2), frame('b', 1500, 1), frame('c', 3000), { id: 'n', type: 'sticky', z: 5, x: 100, y: 100, w: 180, h: 150 } as El,
    { id: 'far', type: 'sticky', z: 6, x: 9000, y: 0, w: 100, h: 100 } as El]) els[e.id] = e;
  return els;
};
const get = (els: Record<string, El>) => (id: string) => els[id];

describe('slides', () => {
  beforeAll(() => setMeasurer((text, size) => text.length * size * 0.5));
  it('lists slide frames in order', () => {
    expect(slidesOf(page()).map(f => f.id)).toEqual(['b', 'a']);
  });
  it('adds, removes, and renumbers', () => {
    const els = page();
    setSlide(els, els.c, true); expect(els.c.slide).toBe(3);
    setSlide(els, els.b, false); expect(els.b.slide).toBeUndefined();
    expect(slidesOf(els).map(f => [f.id, f.slide])).toEqual([['a', 1], ['c', 2]]);
    els.a.slide = 5; renumber(els); expect(els.a.slide).toBe(2);
  });
  it('moves a slide', () => {
    const els = page(); setSlide(els, els.c, true);
    moveSlide(els, 'c', 0);
    expect(slidesOf(els).map(f => f.id)).toEqual(['c', 'b', 'a']);
    moveSlide(els, 'c', 99);
    expect(slidesOf(els).map(f => f.id)).toEqual(['b', 'a', 'c']);
  });
  it('finds what sits on a slide', () => {
    const els = page();
    expect(slideMembers(els, els.a, get(els)).map(e => e.id)).toEqual(['n']);
  });
  it('places new slides after the last one', () => {
    const els = page();
    expect(nextSlideSpot(els, get(els))).toEqual({ x: 1280 + 160, y: 0 });
    expect(nextSlideSpot({}, () => undefined as never)).toEqual({ x: 0, y: 0 });
  });
  it('builds a slide from a layout', () => {
    const els = page(); let n = 0;
    const made = newSlide(els, get(els), 'titleBody', 'standard', p => p + ++n, 10);
    expect(made[0]).toMatchObject({ type: 'frame', slide: 3, w: 1024, h: 768, fill: '#ffffff', z: 10 });
    expect(made.slice(1).every(e => e.type === 'text' && e.x >= made[0].x && e.y >= made[0].y && e.x + e.w <= made[0].x + made[0].w)).toBe(true);
    expect(made.length).toBe(1 + LAYOUTS.titleBody.phs.length);
    expect(made.slice(1).map(e => e.ph)).toEqual(['title', 'body']);
    expect(made[0]).toMatchObject({ theme: 'standard', layout: 'titleBody', tc: { fill: 'lt1' } });
  });
  it('knows sizes and dark backgrounds', () => {
    expect(sizeOf(frame('x', 0))).toBe('wide');
    expect(sizeOf({ ...frame('x', 0), w: 10 })).toBeNull();
    expect(darkBg('#17202d')).toBe(true); expect(darkBg('#ffffff')).toBe(false); expect(darkBg(undefined)).toBe(false);
  });
});
