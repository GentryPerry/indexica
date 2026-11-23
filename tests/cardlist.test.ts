import { beforeAll, describe, expect, it } from 'vitest';
import { cardList, cardProgress, cardTitle } from '../src/tasks';
import { fitText, layoutText, setMeasurer } from '../src/geometry';
import { CHECK, isChecked } from '../src/richtext';
import type { El } from '../src/types';

beforeAll(() => setMeasurer((t, size) => t.length * size * 0.5));
const card = (o: Partial<El> = {}): El => ({ id: 'c', type: 'card', x: 0, y: 0, w: 240, h: 100, status: 'todo', text: 'Launch\nOrder labels\n\tConfirm size\nCall Kelly', ...o } as El);

describe('task card checklists', () => {
  it('reads the title from the first line', () => {
    expect(cardTitle(card())).toBe('Launch');
    expect(cardTitle(card({ text: 'Solo' }))).toBe('Solo');
  });
  it('turns the lines under the title into a checklist with shifted checks', () => {
    const l = cardList(card({ checked: [1, 3] }))!;
    expect(l.text).toBe('Order labels\n\tConfirm size\nCall Kelly');
    expect(l.bullets).toBe('check');
    expect([0, 1, 2].map(i => isChecked(l, i))).toEqual([true, false, true]);
    expect(layoutText(l, 200).lines.every(ln => ln.marker === CHECK)).toBe(true);
    expect(cardList(card({ text: 'Solo' }))).toBeNull();
  });
  it('counts progress, skipping empty lines', () => {
    expect(cardProgress(card({ checked: [2] }))).toEqual([1, 3]);
    expect(cardProgress(card({ text: 'Solo' }))).toEqual([0, 0]);
  });
  it('grows to fit its list and shrinks back', () => {
    const c = card({ text: 'Launch\n' + Array.from({ length: 8 }, (_, i) => 'Item ' + i).join('\n') });
    fitText(c);
    expect(c.h).toBeGreaterThan(150);
    c.text = 'Launch'; fitText(c);
    expect(c.h).toBe(100);
  });
});
