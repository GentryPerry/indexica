import { beforeAll, describe, expect, it } from 'vitest';
import { allHave, applyStyle, dropKeys, editRuns, normRuns, reindentRuns, spansOf, styleAt, type Run } from '../src/runs';
import { boxTextHeight, fitText, layoutText, setMeasurer, textHeight } from '../src/geometry';
import { isRich, indentParas } from '../src/richtext';
import type { El } from '../src/types';

beforeAll(() => setMeasurer((t, size, weight) => t.length * size * (weight >= 600 ? 0.6 : 0.5)));

describe('normRuns', () => {
  it('sorts, clips, drops empty and unstyled runs, and merges equal neighbours', () => {
    const r = normRuns([{ s: 5, e: 8, w: 700 }, { s: 0, e: 3, w: 700 }, { s: 3, e: 5, w: 700 }, { s: 9, e: 9, i: true }, { s: 10, e: 20, u: false }, { s: 8, e: 30, c: '#ff0000' }], 12);
    expect(r).toEqual([{ s: 0, e: 8, w: 700 }, { s: 8, e: 12, c: '#ff0000' }]);
  });
  it('keeps italic turned off, but not underline turned off', () => {
    expect(normRuns([{ s: 0, e: 2, i: false }, { s: 2, e: 4, u: false }], 4)).toEqual([{ s: 0, e: 2, i: false }]);
  });
  it('trims overlaps so runs never cover the same character twice', () => {
    expect(normRuns([{ s: 0, e: 5, w: 700 }, { s: 3, e: 8, i: true }], 10)).toEqual([{ s: 0, e: 5, w: 700 }, { s: 5, e: 8, i: true }]);
  });
});

describe('applyStyle', () => {
  it('styles a range and leaves the rest alone', () => {
    const r = applyStyle([], 11, 6, 11, { w: 700 });
    expect(r).toEqual([{ s: 6, e: 11, w: 700 }]);
    expect(styleAt(r, 5)).toEqual({}); expect(styleAt(r, 6)).toEqual({ w: 700 });
  });
  it('splits runs and merges keys', () => {
    const r = applyStyle([{ s: 0, e: 10, w: 700 }], 10, 3, 6, { c: '#00ff00' });
    expect(r).toEqual([{ s: 0, e: 3, w: 700 }, { s: 3, e: 6, w: 700, c: '#00ff00' }, { s: 6, e: 10, w: 700 }]);
  });
  it('removes keys with null and drops runs left with nothing', () => {
    expect(applyStyle([{ s: 0, e: 10, w: 700 }], 10, 0, 10, { w: null })).toEqual([]);
    expect(applyStyle([{ s: 0, e: 10, w: 700 }], 10, 2, 4, { w: null })).toEqual([{ s: 0, e: 2, w: 700 }, { s: 4, e: 10, w: 700 }]);
  });
  it('tells whether a whole range has a style', () => {
    const r: Run[] = [{ s: 0, e: 5, w: 700 }];
    expect(allHave(r, 0, 5, 'w')).toBe(true); expect(allHave(r, 0, 6, 'w')).toBe(false);
    expect(allHave(r, 1, 3, 'w', 700)).toBe(true); expect(allHave(r, 2, 2, 'w')).toBe(false);
  });
  it('drops keys the whole piece now sets', () => {
    expect(dropKeys([{ s: 0, e: 3, c: '#111111', w: 700 }, { s: 5, e: 6, c: '#222222' }], 8, ['c'])).toEqual([{ s: 0, e: 3, w: 700 }]);
  });
  it('lists styled spans covering a range', () => {
    expect(spansOf([{ s: 2, e: 4, i: true }], 0, 6)).toEqual([{ s: 0, e: 2, st: {} }, { s: 2, e: 4, st: { i: true } }, { s: 4, e: 6, st: {} }]);
  });
});

describe('editRuns', () => {
  const bold: Run[] = [{ s: 6, e: 11, w: 700 }];
  it('shifts runs after typing before them', () => {
    expect(editRuns(bold, 'Hello world', 'Hello, world')).toEqual([{ s: 7, e: 12, w: 700 }]);
  });
  it('grows a run when typing inside or at its end', () => {
    expect(editRuns(bold, 'Hello world', 'Hello worlds')).toEqual([{ s: 6, e: 12, w: 700 }]);
    expect(editRuns(bold, 'Hello world', 'Hello wo-rld')).toEqual([{ s: 6, e: 12, w: 700 }]);
  });
  it('does not grow a run when typing right before it', () => {
    expect(editRuns(bold, 'Hello world', 'Hello Xworld')).toEqual([{ s: 7, e: 12, w: 700 }]);
  });
  it('gives text typed at the very start the style of what follows', () => {
    expect(editRuns([{ s: 0, e: 5, i: true }], 'Hello', 'Oh Hello')).toEqual([{ s: 0, e: 8, i: true }]);
  });
  it('shrinks and removes runs when text is deleted', () => {
    expect(editRuns(bold, 'Hello world', 'Hello wd')).toEqual([{ s: 6, e: 8, w: 700 }]);
    expect(editRuns(bold, 'Hello world', 'Hello ')).toEqual([]);
  });
  it('keeps runs on their words when paragraphs are indented', () => {
    const before = 'One two\nThree four', after = indentParas(before, 0, 1, 1);
    expect(reindentRuns([{ s: 4, e: 7, w: 700 }, { s: 14, e: 18, i: true }], before, after)).toEqual([{ s: 5, e: 8, w: 700 }, { s: 16, e: 20, i: true }]);
  });
});

describe('layoutText with runs', () => {
  const txt = (text: string, runs: Run[], over: Partial<El> = {}): El => ({ id: 't', type: 'text', z: 1, x: 0, y: 0, w: 400, h: 40, text, size: 20, runs, ...over });

  it('makes styled text rich', () => {
    expect(isRich(txt('a', [{ s: 0, e: 1, w: 700 }]))).toBe(true);
    expect(isRich(txt('a', []))).toBe(false);
  });

  it('splits a line into styled pieces placed end to end', () => {
    const { lines } = layoutText(txt('Hello big world', [{ s: 6, e: 9, w: 700, c: '#ff0000' }]), 1000);
    expect(lines).toHaveLength(1);
    const segs = lines[0].segs!;
    expect(segs.map(g => g.text)).toEqual(['Hello ', 'big', ' world']);
    expect(segs[1]).toMatchObject({ weight: 700, color: '#ff0000', dx: 60 });
    expect(segs[2].dx).toBeCloseTo(60 + 3 * 20 * 0.6);
    expect(lines[0].w).toBeCloseTo(60 + 36 + 60);
  });

  it('wraps by the width of each style', () => {
    // Plain words are 10 px a letter at 20 px; bold ones 12.
    const plain = layoutText(txt('aaaa bbbb cccc', []), 100).lines.length;
    const styled = layoutText(txt('aaaa bbbb cccc', [{ s: 0, e: 14, w: 700 }]), 100).lines;
    expect(plain).toBe(2);
    expect(styled.map(l => l.text)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('makes a line taller for a bigger run, and grows the piece', () => {
    const e = txt('small BIG', [{ s: 6, e: 9, z: 40 }]);
    const { lines, height } = layoutText(e, 1000);
    expect(lines[0].size).toBe(20);
    expect(lines[0].segs![1].size).toBe(40);
    expect(height).toBeCloseTo(40 * 1.3);
    expect(textHeight(e, 1000)).toBeCloseTo(52);
  });

  it('follows paragraph offsets past levels and line breaks', () => {
    const { lines } = layoutText(txt('First\n\tSecond word', [{ s: 14, e: 18, i: true }], { bullets: 'disc' }), 1000);
    expect(lines[1].segs!.map(g => [g.text, g.italic])).toEqual([['Second ', false], ['word', true]]);
    expect(lines[1].marker).toBeTruthy();
  });

  it('scales run sizes with shrink-to-fit', () => {
    const { lines } = layoutText(txt('a b', [{ s: 2, e: 3, z: 40 }], { ph: 'body', fit: 10 }), 1000);
    expect(lines[0].segs![1].size).toBe(20);
  });
});

describe('notes, shapes, and tables with runs', () => {
  it('measure styled text in notes and shapes', () => {
    const e: El = { id: 's', type: 'rect', z: 1, x: 0, y: 0, w: 200, h: 40, text: 'Go BIG', size: 15, runs: [{ s: 3, e: 6, z: 30 }] };
    expect(boxTextHeight(e, 1000)).toBeCloseTo(39);
    fitText(e); expect(e.h).toBeGreaterThanOrEqual(59);
  });
  it('shrink a sticky note with its styled words', () => {
    const e: El = { id: 'n', type: 'sticky', z: 1, x: 0, y: 0, w: 180, h: 180, text: 'one two three four five six seven eight nine ten', runs: [{ s: 0, e: 3, z: 40 }] };
    fitText(e);
    expect(e.fit).toBeLessThan(24);
    expect(e.h).toBe(180);
  });
  it('size table rows for styled cells', () => {
    const e: El = { id: 't', type: 'table', z: 1, x: 0, y: 0, w: 400, h: 60, size: 13, cells: [['a', 'b'], ['c', 'd']], cruns: [[[{ s: 0, e: 1, z: 40 }], null], [null, null]] };
    fitText(e);
    expect(e.h).toBeGreaterThanOrEqual(2 * (40 * 1.3 + 16) - 1);
  });
});

