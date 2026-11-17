import { describe, expect, it } from 'vitest';
import { elLabel, outlineRows } from '../src/outline';
import type { El } from '../src/types';

const el = (p: Partial<El>): El => ({ id: 'x', type: 'sticky', z: 1, x: 0, y: 0, w: 100, h: 100, ...p });
const get = (list: El[]) => (id: string) => list.find(e => e.id === id);

describe('outline labels', () => {
  it('uses the first line of text', () => expect(elLabel(el({ text: '\n  Plan it \nmore' }), get([]))).toBe('Plan it'));
  it('shortens long text', () => expect(elLabel(el({ text: 'a'.repeat(80) }), get([])).length).toBe(60));
  it('falls back to the kind of piece', () => {
    expect(elLabel(el({ type: 'rect' }), get([]))).toBe('Rectangle');
    expect(elLabel(el({ type: 'sticker', shape: 'heart' }), get([]))).toBe('Heart sticker');
  });
  it('names a connector by the pieces it joins', () => {
    const a = el({ id: 'a', text: 'Idea' }), b = el({ id: 'b', type: 'diamond' });
    expect(elLabel(el({ type: 'conn', a: 'a', b: 'b' }), get([a, b]))).toBe('Idea to Diamond');
    expect(elLabel(el({ type: 'conn', a: 'a', b: null }), get([a]))).toBe('Connector');
  });
});

describe('outline rows', () => {
  const frame = el({ id: 'f', type: 'frame', text: 'Plan', x: 0, y: 0, w: 600, h: 400 });
  const inner = el({ id: 'inner', type: 'frame', x: 300, y: 0, w: 300, h: 300 });
  const a = el({ id: 'a', x: 20, y: 200, w: 40, h: 40 }), b = el({ id: 'b', x: 20, y: 20, w: 40, h: 40 });
  const c = el({ id: 'c', x: 400, y: 50, w: 40, h: 40 }), out = el({ id: 'out', x: 900, y: 900, w: 40, h: 40 });
  const conn = el({ id: 'k', type: 'conn', a: 'a', b: 'b', z: 9 });
  const list = [out, conn, a, c, b, inner, frame];
  const rows = outlineRows(list, get(list));
  it('lists frames top to bottom with their pieces under them', () => {
    expect(rows.map(r => `${r.depth}:${r.id}`)).toEqual(['0:f', '1:b', '1:a', '1:k', '0:inner', '1:c', '0:out']);
  });
  it('gives a piece to the smallest frame that holds it', () => expect(rows.find(r => r.id === 'c')!.depth).toBe(1));
  it('is empty for an empty board', () => expect(outlineRows([], get([]))).toEqual([]));
});
