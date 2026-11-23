import { beforeAll, describe, expect, it } from 'vitest';
import { cardList, cardProgress, cardTitle } from '../src/tasks';
import { fitText, layoutText, setMeasurer } from '../src/geometry';
import { CHECK, isChecked } from '../src/richtext';
import type { El } from '../src/types';

beforeAll(() => setMeasurer((t, size) => t.length * size * 0.5));
const card = (o: Partial<El> = {}): El => ({ id: 'c', type: 'card', x: 0, y: 0, w: 240, h: 100, status: 'todo', text: 'Order labels\n\tConfirm size\nCall Kelly', ...o } as El);

describe('task cards as to-do lists', () => {
  it('names the card by its first task', () => {
    expect(cardTitle(card())).toBe('Order labels');
  });
  it('gives every line a box, subtasks included', () => {
    const l = cardList(card({ checked: [0, 2] }));
    expect(layoutText(l, 200).lines.map(ln => [ln.para, ln.marker, ln.level])).toEqual([[0, CHECK, 0], [1, CHECK, 1], [2, CHECK, 0]]);
    expect([0, 1, 2].map(i => isChecked(l, i))).toEqual([true, false, true]);
  });
  it('counts progress, skipping empty lines', () => {
    expect(cardProgress(card({ checked: [1] }))).toEqual([1, 3]);
    expect(cardProgress(card({ text: 'Solo\n' }))).toEqual([0, 1]);
  });
  it('grows to fit its tasks and shrinks back', () => {
    const c = card({ text: Array.from({ length: 9 }, (_, i) => 'Task ' + i).join('\n') });
    fitText(c);
    expect(c.h).toBeGreaterThan(150);
    c.text = 'One task'; fitText(c);
    expect(c.h).toBe(100);
  });
});
