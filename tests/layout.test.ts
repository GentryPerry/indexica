import { describe, expect, it } from 'vitest';
import { miniFit, miniToWorld, union } from '../src/layout';
import { groupTasks } from '../src/tasks';
import type { El } from '../src/types';

describe('minimap', () => {
  const world = { x: -100, y: 50, w: 800, h: 200 };
  it('fits the board inside the map and centers it', () => {
    const m = miniFit(world, 180, 120);
    expect(m.k).toBeCloseTo(168 / 800);
    expect(world.x * m.k + m.ox).toBeCloseTo(6);
    expect((world.y + world.h / 2) * m.k + m.oy).toBeCloseTo(60);
  });
  it('maps a click back to the board', () => {
    const m = miniFit(world, 180, 120), p = miniToWorld(m, 90, 60);
    expect(p.x).toBeCloseTo(300); expect(p.y).toBeCloseTo(150);
  });
  it('union covers both boxes', () => {
    expect(union({ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 5, w: 10, h: 20 })).toEqual({ x: -5, y: 0, w: 15, h: 25 });
  });
});

describe('kanban grouping', () => {
  const card = (id: string, status: El['status'], due = '', z = 1): El => ({ id, type: 'card', z, x: 0, y: 0, w: 1, h: 1, status, due });
  it('groups by status and orders by due date, undated last', () => {
    const g = groupTasks([card('a', 'todo', '', 1), card('b', 'todo', '2026-12-01', 2), card('c', 'done', '', 3), card('d', 'todo', '2026-11-20', 4), { ...card('n', 'todo'), type: 'sticky' }]);
    expect(g.todo.map(c => c.id)).toEqual(['d', 'b', 'a']);
    expect(g.done.map(c => c.id)).toEqual(['c']);
    expect(g.doing).toEqual([]);
    expect(Object.keys(g)).toEqual(['todo', 'doing', 'blocked', 'done']);
  });
});
