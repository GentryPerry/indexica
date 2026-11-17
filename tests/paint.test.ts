import { describe, it, expect } from 'vitest';
import { fillLayers, strokeLayers, linearEnds, gradientFrom, cssOf, addStop, removeStop, isGrad, colorOf } from '../src/paint';
import { lightness } from '../src/palette';
import type { El } from '../src/types';

const path = (o: Partial<El>) => ({ id: 'p', type: 'path', z: 1, x: 0, y: 0, w: 10, h: 10, ...o }) as El;

describe('paint layers', () => {
  it('falls back to the plain fill and stroke', () => {
    expect(fillLayers(path({ fill: '#ff0000' }))).toEqual(['#ff0000']);
    expect(fillLayers(path({ fill: 'none' }))).toEqual([]);
    expect(strokeLayers(path({}))).toEqual([{ paint: '', width: 2 }]);
    expect(strokeLayers(path({ stroke: 'none' }))).toEqual([]);
    const g = gradientFrom('#2447d6');
    expect(fillLayers(path({ fill: '#fff', fills: [g, '#000'] }))).toEqual([g, '#000']);
  });
  it('places linear gradients by angle', () => {
    expect(linearEnds(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(linearEnds(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });
  it('makes, previews, and edits gradients', () => {
    const g = gradientFrom('#2447d6');
    expect(isGrad(g)).toBe(true); expect(isGrad('#fff')).toBe(false);
    expect(lightness(g.stops[0][1])).toBeGreaterThan(lightness('#2447d6'));
    expect(cssOf(g)).toMatch(/^linear-gradient\(180deg/);
    expect(cssOf({ ...g, kind: 'radial' })).toMatch(/^radial-gradient/);
    expect(cssOf('', '#111')).toBe('#111');
    const three = addStop(g); expect(three.stops.map(s => s[0])).toEqual([0, 0.5, 1]);
    expect(removeStop(three, 1).stops.length).toBe(2);
    expect(removeStop(g, 0).stops.length).toBe(2);
    expect(colorOf(g)).toBe(g.stops[0][1]);
  });
});
