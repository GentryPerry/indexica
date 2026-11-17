import { describe, expect, it } from 'vitest';
import { cloneEls, clonePages, migrateBoard, nextPageName, TEMPLATES } from '../src/templates';
import type { El, Els } from '../src/types';

let n = 0;
const uid = (p: string) => p + ++n;
const el = (p: Partial<El>): El => ({ id: 'x', type: 'sticky', z: 1, x: 0, y: 0, w: 10, h: 10, ...p });

describe('stored boards', () => {
  it('turns an older single-page board into one page', () => {
    const els = { a: el({ id: 'a' }) };
    const d = migrateBoard({ els }, uid);
    expect(d.pages).toHaveLength(1);
    expect(d.pages[0].name).toBe('Page 1');
    expect(d.pages[0].els).toBe(els);
  });
  it('keeps pages as they are, filling in anything missing', () => {
    const d = migrateBoard({ pages: [{ id: 'p', name: 'Ideas', els: {} }, {}] }, uid);
    expect(d.pages.map(p => p.name)).toEqual(['Ideas', 'Page 2']);
    expect(d.pages[1].els).toEqual({});
  });
  it('handles nothing stored at all', () => expect(migrateBoard(null, uid).pages[0].els).toEqual({}));
});

describe('copying pieces', () => {
  const els: Els = {
    a: el({ id: 'a', g: 'g1' }), b: el({ id: 'b', g: 'g1' }), c: el({ id: 'c' }),
    k: el({ id: 'k', type: 'conn', a: 'a', b: 'gone' }),
  };
  const copy = Object.values(cloneEls(els, uid));
  it('gives every piece a new id', () => {
    expect(copy).toHaveLength(4);
    for (const e of copy) expect(Object.keys(els)).not.toContain(e.id);
  });
  it('keeps connectors attached to the copied pieces', () => {
    const k = copy.find(e => e.type === 'conn')!, a = copy.find(e => e.g && e.id !== k.id)!;
    expect(copy.map(e => e.id)).toContain(k.a);
    expect(k.b).toBeNull();
    expect(a).toBeDefined();
  });
  it('keeps groups together under a new group id', () => {
    const gs = copy.filter(e => e.g).map(e => e.g);
    expect(gs).toHaveLength(2);
    expect(gs[0]).toBe(gs[1]);
    expect(gs[0]).not.toBe('g1');
  });
  it('leaves the original untouched', () => expect(els.k.a).toBe('a'));
  it('copies whole pages with new page ids', () => {
    const p = clonePages([{ id: 'p1', name: 'One', els }], uid)[0];
    expect(p.id).not.toBe('p1');
    expect(p.name).toBe('One');
  });
});

describe('page names', () => {
  it('counts up from the highest number', () => {
    expect(nextPageName([{ name: 'Page 1' }])).toBe('Page 2');
    expect(nextPageName([{ name: 'Page 1' }, { name: 'Page 7' }])).toBe('Page 8');
    expect(nextPageName([{ name: 'Ideas' }, { name: 'Notes' }])).toBe('Page 3');
  });
});

describe('templates', () => {
  it('every template builds, and connectors point at pieces in it', () => {
    for (const t of TEMPLATES) {
      const els = Object.values(t.build(uid));
      if (t.key === 'blank') { expect(els).toEqual([]); continue; }
      expect(els.length).toBeGreaterThan(0);
      const ids = new Set(els.map(e => e.id));
      for (const e of els) if (e.type === 'conn') { expect(ids.has(e.a!)).toBe(true); expect(ids.has(e.b!)).toBe(true); }
    }
  });
  it('builds fresh ids each time', () => {
    const t = TEMPLATES.find(x => x.key === 'retro')!;
    const a = Object.keys(t.build(uid)), b = Object.keys(t.build(uid));
    expect(a.some(id => b.includes(id))).toBe(false);
  });
});
