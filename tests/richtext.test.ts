import { beforeAll, describe, expect, it } from 'vitest';
import { CHECK, clampChecked, indentOf, indentParas, isChecked, isRich, joinParas, levelRatio, markers, parasOf, toggleChecked } from '../src/richtext';
import { fitText, layoutText, setMeasurer, textHeight } from '../src/geometry';
import type { El } from '../src/types';

beforeAll(() => setMeasurer((t, size) => t.length * size * 0.5));
const txt = (text: string, extra: Partial<El> = {}): El => ({ id: 't', type: 'text', z: 1, x: 0, y: 0, w: 400, h: 10, size: 20, text, ...extra });

describe('paragraphs', () => {
  it('reads levels from leading tabs and writes them back', () => {
    const ps = parasOf('One\n\tTwo\n\t\tThree\n\t\t\t\t\t\t\t\t\t\tDeep');
    expect(ps.map(p => p.level)).toEqual([0, 1, 2, 8]);
    expect(ps[1].text).toBe('Two');
    expect(joinParas(ps.slice(0, 3))).toBe('One\n\tTwo\n\t\tThree');
  });
  it('indents and outdents a range of paragraphs, within bounds', () => {
    expect(indentParas('a\nb\nc', 1, 2, 1)).toBe('a\n\tb\n\tc');
    expect(indentParas('a\n\tb', 0, 1, -1)).toBe('a\nb');
  });
  it('numbers within each level and restarts under a new parent', () => {
    const ps = parasOf('A\n\tx\n\ty\nB\n\tz\n\t\tdeep\n\n\tw');
    expect(markers(ps, 'num')).toEqual(['1.', 'a.', 'b.', '2.', 'a.', 'i.', '', 'b.']);
    expect(markers(ps, 'disc').slice(0, 3)).toEqual(['•', '–', '–']);
    expect(markers(ps)).toEqual(ps.map(() => ''));
  });
  it('knows when a piece needs paragraph layout', () => {
    expect(isRich(txt('plain'))).toBe(false);
    expect(isRich(txt('a\n\tb'))).toBe(true);
    expect(isRich(txt('a', { bullets: 'disc' }))).toBe(true);
    expect(isRich({ ...txt('a', { bullets: 'disc' }), type: 'sticky' })).toBe(false);
    expect(levelRatio(txt('', { ph: 'body' }), 2)).toBeCloseTo(20 / 28);
    expect(levelRatio(txt(''), 2)).toBe(1);
  });
});

describe('layout', () => {
  it('matches plain wrapped text when there is nothing rich', () => {
    const e = txt('hello world');
    expect(layoutText(e, 396).height).toBe(26);
    expect(textHeight(e, 396)).toBe(26);
  });
  it('places markers in a hanging indent and steps levels in', () => {
    const { lines } = layoutText(txt('Top\n\tSub', { bullets: 'disc' }), 396);
    expect(lines[0]).toMatchObject({ marker: '•', bx: 0, x: 15 });
    expect(lines[1]).toMatchObject({ marker: '–', bx: 25, x: 40, level: 1 });
  });
  it('shrinks levels in body placeholders and adds paragraph space', () => {
    const { lines, height } = layoutText(txt('Top\n\tSub', { bullets: 'disc', ph: 'body', size: 28 }), 600);
    expect(lines[1].size).toBe(24);
    expect(height).toBeCloseTo(28 * 1.3 + 0.18 * 28 + 24 * 1.3);
  });
  it('applies line spacing and wraps inside the indent', () => {
    const e = txt('aaaa aaaa aaaa', { lsp: 1.5, w: 104 });
    expect(layoutText(e, 100).lines.length).toBe(2);
    expect(layoutText(e, 100).height).toBe(2 * 20 * 1.3 * 1.5);
    fitText(e); expect(e.h).toBe(Math.ceil(78 + 8));
  });
});

describe('checklists', () => {
  it('marks every item with a box, empty lines too while typing but none on the board', () => {
    expect(markers(parasOf('a\n\tb\n'), 'check')).toEqual([CHECK, CHECK, '']);
  });
  it('toggles items and keeps the list tidy', () => {
    const e = { id: 'x', type: 'text', x: 0, y: 0, w: 100, h: 20, text: 'a\nb\nc', bullets: 'check' } as El;
    toggleChecked(e, 2); toggleChecked(e, 0);
    expect(e.checked).toEqual([0, 2]);
    expect(isChecked(e, 2)).toBe(true);
    toggleChecked(e, 0); toggleChecked(e, 2);
    expect(e.checked).toBeUndefined();
  });
  it('drops checked items past the end', () => {
    const e = { id: 'x', type: 'sticky', x: 0, y: 0, w: 100, h: 20, text: 'a', bullets: 'check', checked: [0, 3] } as El;
    expect(clampChecked(e).checked).toEqual([0]);
  });
  it('leaves room for the box before the text', () => {
    expect(indentOf(0, 20, 'check').text).toBeGreaterThan(indentOf(0, 20, 'disc').text);
  });
  it('gives checklist lines their paragraph index for drawing', () => {
    const e = { id: 'x', type: 'sticky', x: 0, y: 0, w: 200, h: 100, text: 'one\ntwo', bullets: 'check', size: 20 } as El;
    expect(layoutText(e, 160).lines.map(l => [l.para, l.marker])).toEqual([[0, CHECK], [1, CHECK]]);
  });
});
