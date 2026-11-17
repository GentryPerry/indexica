import { describe, it, expect, beforeAll } from 'vitest';
import { init } from '../src/pathops';
import * as LB from '../src/livebool';
import { outlineRows } from '../src/outline';
import type { El } from '../src/types';

const rect = (id: string, x: number, y: number, w = 100, h = 100, z = 1): El => ({ id, type: 'rect', x, y, w, h, z } as El);
function board(op: El['live'] = 'union') {
  const els: LB.Els = {
    r: { id: 'r', type: 'path', x: 0, y: 0, w: 0, h: 0, z: 1, live: op, g: 'g1' } as El,
    a: { ...rect('a', 0, 0), boolIn: 'r', g: 'g1' },
    b: { ...rect('b', 50, 50, 100, 100, 2), boolIn: 'r', g: 'g1' },
  };
  return els;
}

describe('live booleans', () => {
  beforeAll(async () => { await init(); });
  it('computes the result from its operands', () => {
    const els = board(), seen = new Map<string, string>();
    expect(LB.syncLive(els, seen)).toEqual(['r']);
    expect(els.r).toMatchObject({ x: 0, y: 0, w: 150, h: 150 });
  });
  it('recomputes only when an operand changes', () => {
    const els = board(), seen = new Map<string, string>();
    LB.syncLive(els, seen);
    expect(LB.syncLive(els, seen)).toEqual([]);
    els.b.x = 200;
    expect(LB.syncLive(els, seen)).toEqual(['r']);
    expect(els.r.w).toBe(300);
  });
  it('follows a change of operation', () => {
    const els = board(), seen = new Map<string, string>();
    LB.syncLive(els, seen);
    els.r.live = 'intersect';
    LB.syncLive(els, seen);
    expect(els.r).toMatchObject({ x: 50, y: 50, w: 50, h: 50 });
  });
  it('subtract cuts later operands from the bottom one', () => {
    const els = board('subtract'); LB.syncLive(els, new Map());
    expect(els.r).toMatchObject({ x: 0, y: 0, w: 100, h: 100 });
    expect(els.r.paths!.length).toBe(1);
  });
  it('updates nested results inner first', () => {
    const els = board();
    els.o = { id: 'o', type: 'path', x: 0, y: 0, w: 0, h: 0, z: 1, live: 'subtract', g: 'g1' } as El;
    els.r.boolIn = 'o';
    els.c = { ...rect('c', 0, 0, 20, 20, 5), boolIn: 'o', g: 'g1' };
    const seen = new Map<string, string>();
    LB.syncLive(els, seen);
    expect(els.o).toMatchObject({ x: 0, y: 0, w: 150, h: 150 });
    els.b.x = 100; LB.syncLive(els, seen);
    expect(els.o.w).toBe(200);
    expect(LB.descendantsOf(els, 'o').map(e => e.id).sort()).toEqual(['a', 'b', 'c', 'r']);
    expect(LB.rootOf(els, els.a).id).toBe('o');
    expect(LB.isUnder(els, els.a, 'o')).toBe(true);
  });
  it('finds the topmost operand under a point', () => {
    const els = board();
    expect(LB.operandAt(els, 'r', 75, 75)!.id).toBe('b');
    expect(LB.operandAt(els, 'r', 10, 10)!.id).toBe('a');
    expect(LB.operandAt(els, 'r', 300, 300)).toBeNull();
  });
  it('bakes into a plain vector', () => {
    const els = board(); LB.syncLive(els, new Map());
    expect(LB.bake(els, 'r').sort()).toEqual(['a', 'b']);
    expect(els.r.live).toBeUndefined(); expect(els.a).toBeUndefined();
  });
  it('releases its operands, keeping inner results grouped', () => {
    const els = board();
    els.o = { id: 'o', type: 'path', x: 0, y: 0, w: 0, h: 0, z: 1, live: 'union', g: 'g0' } as El;
    els.r.boolIn = 'o'; els.c = { ...rect('c', 0, 0, 20, 20, 5), boolIn: 'o', g: 'g0' };
    for (const k of ['r', 'a', 'b']) els[k].g = 'g0';
    const out = LB.release(els, 'o', () => 'g9');
    expect(out.map(e => e.id).sort()).toEqual(['c', 'r']);
    expect(els.o).toBeUndefined(); expect(els.c.boolIn).toBeUndefined();
    expect(els.r.g).toBe('g9'); expect(els.a.g).toBe('g9'); expect(els.a.boolIn).toBe('r');
  });
  it('lists results with no operands left', () => {
    const els = board(); delete els.a; delete els.b;
    expect(LB.orphans(els).map(e => e.id)).toEqual(['r']);
  });
  it('nests operands under their result in the outline', () => {
    const els = board(); LB.syncLive(els, new Map());
    const rows = outlineRows(Object.values(els), id => els[id]);
    expect(rows.map(r => [r.id, r.depth, r.label])).toEqual([['r', 0, 'Union'], ['b', 1, 'Rectangle'], ['a', 1, 'Rectangle']]);
  });
  it('trusts stored results until an operand changes', () => {
    const els = board(), seen = new Map<string, string>();
    LB.syncLive(els, new Map());
    els.r.paths = [{ nodes: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }];
    LB.trust(els, seen);
    expect(LB.syncLive(els, seen)).toEqual([]);
    els.a.x = 10;
    expect(LB.syncLive(els, seen)).toEqual(['r']);
  });
});
