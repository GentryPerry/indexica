import { describe, expect, it } from 'vitest';
import { GridIndex, pickAt } from '../src/lod';
import type { El } from '../src/types';

const box = (id: string, x: number, y: number, w = 100, h = 100, extra: Partial<El> = {}): El => ({ id, type: 'rect', z: 1, x, y, w, h, ...extra });

describe('grid index', () => {
  it('finds pieces in a box and nothing far away', () => {
    const idx = new GridIndex(500);
    const els = [box('a', 0, 0), box('b', 2000, 2000), box('c', 450, 450, 200, 200)];
    for (const e of els) idx.add(e.id, e);
    expect([...idx.query({ x: -10, y: -10, w: 120, h: 120 })]).toEqual(['a']);
    expect(idx.query({ x: 500, y: 500, w: 10, h: 10 }).has('c')).toBe(true);
    expect(idx.query({ x: 1000, y: 1000, w: 100, h: 100 }).size).toBe(0);
    expect(idx.count).toBe(3);
  });
  it('keeps huge pieces findable from anywhere they cover', () => {
    const idx = new GridIndex(100);
    idx.add('huge', { x: 0, y: 0, w: 100000, h: 100000 });
    expect(idx.query({ x: 50000, y: 50000, w: 1, h: 1 }).has('huge')).toBe(true);
    expect(idx.query({ x: -500, y: -500, w: 10, h: 10 }).has('huge')).toBe(false);
  });
  it('answers a query covering everything', () => {
    const idx = new GridIndex(10);
    for (let i = 0; i < 50; i++) idx.add('p' + i, { x: i * 1000, y: 0, w: 5, h: 5 });
    expect(idx.query({ x: -1, y: -1, w: 1e6, h: 10 }).size).toBe(50);
  });
});

describe('picking', () => {
  it('picks the topmost piece under a point, honoring rotation', () => {
    const a = box('a', 0, 0, 200, 200), b = box('b', 50, 50, 100, 100), r = box('r', 400, 0, 200, 20, { rot: 90 });
    const order = [a, b, r], idx = new GridIndex();
    idx.add('a', a); idx.add('b', b); idx.add('r', { x: 490, y: -90, w: 20, h: 200 });
    expect(pickAt(order, idx, 60, 60)!.id).toBe('b');
    expect(pickAt(order, idx, 10, 10)!.id).toBe('a');
    expect(pickAt(order, idx, 500, -50)!.id).toBe('r');
    expect(pickAt(order, idx, 450, 10)).toBeUndefined();
  });
  it('skips hidden boolean operands, connectors, and empty frames', () => {
    const f = { ...box('f', 0, 0, 300, 300), type: 'frame' as const }, op = box('o', 10, 10, 50, 50, { boolIn: 'x' });
    const idx = new GridIndex(); idx.add('f', f); idx.add('o', op);
    expect(pickAt([f, op], idx, 20, 20)).toBeUndefined();
    const slide = { ...f, slide: 1 };
    expect(pickAt([slide], idx, 20, 20)!.id).toBe('f');
  });
});
