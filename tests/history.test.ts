import { describe, expect, it } from 'vitest';
import { History } from '../src/history';
import type { El, Els } from '../src/types';

const el = (id: string, x = 0): El => ({ id, type: 'rect', z: 1, x, y: 0, w: 10, h: 10 });

describe('History', () => {
  it('reports no change when nothing was edited', () => {
    const els: Els = { a: el('a') }, hist = new History();
    hist.reset(els);
    expect(hist.commit(els)).toBe(false);
    expect(hist.undo).toHaveLength(0);
  });

  it('undoes and redoes an edit, an add, and a delete as one step', () => {
    const els: Els = { a: el('a'), b: el('b') }, hist = new History();
    hist.reset(els);
    els.a.x = 50; els.c = el('c'); delete els.b;
    expect(hist.commit(els)).toBe(true);

    const gone = hist.step(els, 'undo');
    expect(gone).toEqual(['c']);
    expect(els.a.x).toBe(0);
    expect(els.b).toBeDefined();
    expect(els.c).toBeUndefined();

    expect(hist.step(els, 'redo')).toEqual(['b']);
    expect(els.a.x).toBe(50);
    expect(els.c).toBeDefined();
  });

  it('returns null when there is nothing to undo', () => {
    const hist = new History();
    hist.reset({});
    expect(hist.step({}, 'undo')).toBeNull();
  });

  it('clears redo after a new edit', () => {
    const els: Els = { a: el('a') }, hist = new History();
    hist.reset(els);
    els.a.x = 1; hist.commit(els);
    hist.step(els, 'undo');
    els.a.x = 2; hist.commit(els);
    expect(hist.redo).toHaveLength(0);
  });

  it('drops the oldest step past the limit', () => {
    const els: Els = { a: el('a') }, hist = new History(3);
    hist.reset(els);
    for (let i = 1; i <= 5; i++) { els.a.x = i; hist.commit(els); }
    expect(hist.undo).toHaveLength(3);
  });

  it('does not treat an undo as a new edit', () => {
    const els: Els = { a: el('a') }, hist = new History();
    hist.reset(els);
    els.a.x = 9; hist.commit(els);
    hist.step(els, 'undo');
    expect(hist.commit(els)).toBe(false);
  });
});
