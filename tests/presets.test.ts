import { beforeAll, describe, expect, it } from 'vitest';
import { PRESET_COUNT } from '../src/presets-data';
import { defaultAdj, dragHandle, guides, loadPresets, presetDef, presetHandles, presetLabel, presetNames, presetPaths, presetText, SHAPE_GROUPS } from '../src/presetgeom';

beforeAll(() => loadPresets());
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

describe('preset shapes', () => {
  it('has the whole ECMA-376 set and every gallery shape exists', () => {
    expect(presetNames().length).toBe(PRESET_COUNT);
    expect(PRESET_COUNT).toBeGreaterThanOrEqual(180);
    for (const [, names] of SHAPE_GROUPS) for (const n of names) expect(presetDef(n), n).toBeTruthy();
  });
  it('draws every shape with finite numbers at several sizes', () => {
    for (const n of presetNames()) for (const [w, h] of [[200, 100], [60, 240], [1, 1]]) {
      const ps = presetPaths(presetDef(n)!, w, h);
      for (const p of ps) expect(nums(p.d).every(Number.isFinite), `${n} ${w}x${h}`).toBe(true);
    }
  });
  it('draws a rectangle as its box', () => {
    expect(presetPaths(presetDef('rect')!, 100, 50)[0].d).toBe('M0 0L100 0L100 50L0 50Z');
  });
  it('draws an ellipse with arcs that come back to the start', () => {
    const d = presetPaths(presetDef('ellipse')!, 100, 50)[0].d, n = nums(d);
    expect(d.startsWith('M0 25')).toBe(true);
    expect(n[n.length - 2]).toBeCloseTo(0, 1); expect(n[n.length - 1]).toBeCloseTo(25, 1);
    expect(Math.max(...n.filter((_, i) => i % 2 === 0))).toBeCloseTo(100, 0);
  });
  it('keeps arrowheads the same when an arrow gets longer', () => {
    const def = presetDef('rightArrow')!;
    const a = guides(def, 200, 100), b = guides(def, 600, 100);
    expect(a.r - a.x1).toBeCloseTo(b.r - b.x1);
  });
  it('gives callouts a text box inside the body', () => {
    const t = presetText(presetDef('wedgeRectCallout')!, 200, 100);
    expect(t).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    const can = presetText(presetDef('can')!, 100, 200);
    expect(can.y).toBeGreaterThan(0);
  });
  it('moves an adjust handle toward the pointer within its limits', () => {
    const def = presetDef('roundRect')!, adj = defaultAdj(def);
    expect(adj.adj).toBe(16667);
    const h0 = presetHandles(def, 200, 100, adj)[0];
    const moved = dragHandle(def, 200, 100, adj, 0, 40, 0);
    expect(presetHandles(def, 200, 100, moved)[0].x).toBeCloseTo(40, 0);
    expect(moved.adj).toBeGreaterThan(adj.adj); expect(h0.x).toBeCloseTo(16.67, 1);
    expect(dragHandle(def, 200, 100, adj, 0, 500, 0).adj).toBeLessThanOrEqual(50000);
  });
  it('names shapes readably', () => {
    expect(presetLabel('rightArrow')).toBe('Right arrow');
    expect(presetLabel('flowChartDecision')).toBe('Flowchart decision');
    expect(presetLabel('star5')).toBe('Star 5');
  });
});
