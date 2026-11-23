import { describe, expect, it } from 'vitest';
import { ctxKinds, shared, stepSize } from '../src/ctxbar';
import type { El } from '../src/types';

const el = (o: Partial<El>): El => ({ id: Math.random().toString(36).slice(2), type: 'sticky', x: 0, y: 0, w: 100, h: 100, ...o } as El);

describe('selection toolbar', () => {
  it('gives notes fill, text, and note controls', () => {
    expect(ctxKinds([el({ type: 'sticky' })])).toEqual({ fill: true, text: true, note: true });
  });
  it('gives frames a fill only', () => {
    expect(ctxKinds([el({ type: 'frame' })])).toEqual({ fill: true, text: false, note: false });
  });
  it('gives text a text section only', () => {
    expect(ctxKinds([el({ type: 'text' })])).toEqual({ fill: false, text: true, note: false });
  });
  it('mixes to what every piece shares', () => {
    expect(ctxKinds([el({ type: 'sticky' }), el({ type: 'rect' })])).toEqual({ fill: true, text: true, note: false });
    expect(ctxKinds([el({ type: 'frame' }), el({ type: 'text' })])).toBeNull();
  });
  it('stays away from locked pieces, booleans, and other types', () => {
    expect(ctxKinds([el({ locked: true })])).toBeNull();
    expect(ctxKinds([el({ type: 'path', live: 'union' } as Partial<El>)])).toBeNull();
    expect(ctxKinds([el({ type: 'pen' })])).toBeNull();
    expect(ctxKinds([])).toBeNull();
  });
  it('steps sizes and stops at the ends', () => {
    expect(stepSize(24, 1)).toBe(28);
    expect(stepSize(24, -1)).toBe(20);
    expect(stepSize(25, -1)).toBe(24);
    expect(stepSize(128, 1)).toBe(128);
    expect(stepSize(8, -1)).toBe(8);
  });
  it('reads a shared value', () => {
    expect(shared([el({ fill: '#fff' }), el({ fill: '#fff' })], e => e.fill)).toBe('#fff');
    expect(shared([el({ fill: '#fff' }), el({ fill: '#000' })], e => e.fill)).toBeUndefined();
  });
});
