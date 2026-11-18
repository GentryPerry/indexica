import { describe, expect, it, beforeAll } from 'vitest';
import { applyLayout, applyTheme, footerPieces, footDate, linkTheme, mix, pageTheme, phPrompt, placeholders, themeById, themeValue, THEMES, LAYOUTS } from '../src/deck';
import { fitText, setMeasurer, textStyle } from '../src/geometry';
import { newSlide } from '../src/slides';
import type { El } from '../src/types';

beforeAll(() => setMeasurer((t, size) => t.length * size * 0.5));

const lookup = (els: Record<string, El>) => (id: string) => els[id];
function deck(layout = 'titleBody') {
  const els: Record<string, El> = {}; let n = 0;
  const uid = (p: string) => p + ++n;
  for (const e of newSlide(els, lookup(els), layout, 'wide', uid, 1)) els[e.id] = e;
  return { els, uid, frame: Object.values(els).find(e => e.type === 'frame')! };
}

describe('themes', () => {
  it('has the eight DeckCraft themes with twelve slots each', () => {
    expect(THEMES.map(t => t.name)).toEqual(['Standard', 'Harbor', 'Ember', 'Meadow', 'Nocturne', 'Paper', 'Coral Reef', 'Slate']);
    for (const t of THEMES) expect(Object.values(t.colors).every(c => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(themeById('nope').id).toBe('standard');
  });
  it('resolves slots, tints, and font roles', () => {
    const th = themeById('harbor');
    expect(themeValue('accent1', th)).toBe('#1b7fa6');
    expect(themeValue('major', th)).toBe('serif');
    expect(themeValue('minor', th)).toBe('sans');
    expect(themeValue('dk1~50', themeById('standard'))).toBe(mix('#000000', '#ffffff', 0.5));
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(themeValue('bogus', th)).toBeUndefined();
  });
  it('repaints linked fields when the theme changes and leaves hand-picked ones', () => {
    const { els, frame } = deck();
    const box: El = { id: 'b', type: 'rect', z: 9, x: frame.x + 10, y: frame.y + 10, w: 50, h: 50 };
    linkTheme(box, 'fill', 'accent2', pageTheme(els)); els.b = box;
    const title = Object.values(els).find(e => e.ph === 'title')!, body = Object.values(els).find(e => e.ph === 'body')!;
    body.color = '#ff0000';
    applyTheme(els, 'nocturne');
    const n = themeById('nocturne');
    expect(frame.theme).toBe('nocturne');
    expect(frame.fill).toBe(n.colors.lt1);
    expect(box.fill).toBe(n.colors.accent2);
    expect(title.color).toBe(n.colors.dk2);
    expect(body.color).toBe('#ff0000');
    expect(body.tc!.color).toBeUndefined();
    expect(body.tc!.font).toBe('minor');
    expect(pageTheme(els).id).toBe('nocturne');
    applyTheme(els, 'paper');
    expect(title.font).toBe('serif');
  });
});

describe('layouts and placeholders', () => {
  it('scales the 960 by 540 layouts to the slide', () => {
    const { els, frame } = deck('title');
    const t = Object.values(els).find(e => e.ph === 'title')!;
    expect(t).toMatchObject({ x: frame.x + 160, w: 960, size: 80, align: 'center', va: 'bottom', text: '' });
    expect(Object.values(els).find(e => e.ph === 'subtitle')!.size).toBe(32);
  });
  it('moves content into the new layout and keeps leftovers that have text', () => {
    const { els, frame, uid } = deck('twoCol');
    const get = lookup(els), phs = () => placeholders(els, frame, get);
    phs().find(e => e.ph === 'title')!.text = 'Plan';
    phs().find(e => e.ph === 'body2')!.text = 'Right side';
    const { added, removed } = applyLayout(els, frame, 'title', get, uid, 50);
    expect(frame.layout).toBe('title');
    expect(added).toEqual([]);
    expect(removed.length).toBe(0);
    const now = phs();
    expect(now.find(e => e.ph === 'title')!.text).toBe('Plan');
    expect(now.find(e => e.ph === 'subtitle')!.text).toBe('');
    const kept = Object.values(els).find(e => e.text === 'Right side')!;
    expect(kept.ph).toBeUndefined();
  });
  it('removes empty leftovers and adds missing placeholders', () => {
    const { els, frame, uid } = deck('titleOnly');
    const r = applyLayout(els, frame, 'compare', lookup(els), uid, 50);
    expect(r.added.length).toBe(4);
    const back = applyLayout(els, frame, 'blank', lookup(els), uid, 60);
    expect(back.removed.length).toBe(5);
    expect(placeholders(els, frame, lookup(els))).toEqual([]);
  });
  it('resets a moved placeholder to its layout box', () => {
    const { els, frame, uid } = deck();
    const t = Object.values(els).find(e => e.ph === 'title')!, x = t.x;
    t.x += 300; t.size = 12;
    applyLayout(els, frame, 'titleBody', lookup(els), uid, 50);
    expect(t.x).toBe(x); expect(t.size).toBe(59);
  });
  it('shrinks overflowing text to fit its box', () => {
    const { els } = deck();
    const t = Object.values(els).find(e => e.ph === 'title')!, h = t.h;
    t.text = 'A very long title that will never fit on one line of this box at this size, no matter what';
    fitText(t);
    expect(t.h).toBe(h);
    expect(t.fit).toBeLessThan(t.size!);
    expect(textStyle(t).size).toBe(t.fit);
    t.text = 'Short'; fitText(t);
    expect(t.fit).toBeUndefined();
  });
  it('has prompts and every layout fits its slide', () => {
    expect(phPrompt('title')).toBe('Click to add title');
    expect(phPrompt('body2')).toBe('Click to add text');
    for (const l of Object.values(LAYOUTS)) for (const d of l.phs) { expect(d.box[0] + d.box[2]).toBeLessThanOrEqual(960); expect(d.box[1] + d.box[3]).toBeLessThanOrEqual(540); }
  });
});

describe('footers', () => {
  it('draws the slide number, date, and text in theme ink', () => {
    const { frame } = deck();
    expect(footerPieces(frame, themeById('standard'), 'Today')).toEqual([]);
    frame.foot = { num: true, date: true, text: 'JAM' };
    const p = footerPieces(frame, themeById('standard'), 'Today');
    expect(p.map(e => e.text)).toEqual(['Today', 'JAM', '1']);
    expect(p[2]).toMatchObject({ align: 'right', size: 16, color: mix('#000000', '#ffffff', 0.75) });
    expect(footDate(new Date(2026, 10, 17))).toBe('November 17, 2026');
  });
});
