import { describe, expect, it } from 'vitest';
import { atRest, kick, step, still } from '../src/cable';
import { cableSag, connGeom } from '../src/connectors';
import { bbox } from '../src/geometry';
import type { El } from '../src/types';

const el = (p: Partial<El>): El => ({ id: 'x', type: 'rect', z: 1, x: 0, y: 0, w: 100, h: 100, ...p });
const a = el({ id: 'a' }), right = el({ id: 'b', x: 300, y: 0 }), below = el({ id: 'b', x: 20, y: 400 });
const get = (list: El[]) => (id: string) => list.find(e => e.id === id);
const conn = (style?: El['style']): El => el({ id: 'c', type: 'conn', a: 'a', b: 'b', style });

describe('connector styles', () => {
  it('straight is a single segment between the facing edges', () => {
    const g = connGeom(conn(), get([a, right]));
    expect(g.d).toBe('M105 50L295 50');
    expect(g.label).toEqual({ x: 200, y: 50 });
    expect(g.a1).toBe(0);
  });
  it('curved leaves and arrives square to the facing sides', () => {
    const g = connGeom(conn('curve'), get([a, right]));
    expect(g.p).toEqual({ x: 105, y: 50 });
    expect(g.q).toEqual({ x: 295, y: 50 });
    expect(g.d.startsWith('M105 50C')).toBe(true);
    expect(g.a1).toBeCloseTo(0);
  });
  it('right angle uses top and bottom sides when pieces are stacked', () => {
    const g = connGeom(conn('elbow'), get([a, below]));
    expect(g.pts).toEqual([{ x: 50, y: 105 }, { x: 50, y: 250 }, { x: 70, y: 250 }, { x: 70, y: 395 }]);
    expect(g.a1).toBeCloseTo(Math.PI / 2);
    expect(g.label).toEqual({ x: 60, y: 250 });
  });
  it('cable hangs below the straight line and plugs in at the edges', () => {
    const g = connGeom(conn('cable'), get([a, right]));
    expect(g.p).toEqual({ x: 100, y: 50 });
    expect(g.label.y).toBeCloseTo(50 + cableSag(200));
    expect(g.a0).toBeGreaterThan(0);
    expect(g.a1).toBeLessThan(0);
  });
  it('a swinging cable moves its belly but not its ends', () => {
    const rest = connGeom(conn('cable'), get([a, right])), moving = connGeom(conn('cable'), get([a, right]), { x: 12, y: -8 });
    expect(moving.p).toEqual(rest.p);
    expect(moving.label.x).toBeCloseTo(rest.label.x + 12);
    expect(moving.label.y).toBeCloseTo(rest.label.y - 8);
  });
  it('bounds of a cable include the hanging part', () => {
    expect(bbox(conn('cable'), get([a, right])).h).toBeGreaterThan(50);
  });
  it('longer cables hang lower, within limits', () => {
    expect(cableSag(400)).toBeGreaterThan(cableSag(100));
    expect(cableSag(1e6)).toBe(170);
  });
});

describe('cable swing', () => {
  it('a push sends the belly the opposite way, capped', () => {
    expect(kick(still(), 10, 0).x).toBe(-6);
    expect(Math.hypot(kick(still(), 5000, 0).x, 0)).toBe(70);
  });
  it('settles back to rest', () => {
    let s = kick(still(), 40, 25);
    let overshot = false;
    for (let i = 0; i < 600 && !atRest(s); i++) { s = step(s, 1 / 60); if (s.x > 0) overshot = true; }
    expect(atRest(s)).toBe(true);
    expect(overshot).toBe(true);
  });
  it('stays stable on a very long frame', () => {
    const s = step(kick(still(), 40, 0), 5);
    expect(Math.abs(s.x)).toBeLessThan(40);
  });
});
