import { describe, expect, it } from 'vitest';
import { addCategory, addSeries, chartLayout, dropCategory, dropSeries, fromTable, niceScale, num, sampleChart, seriesColors, tickLabel, CHART_KINDS, type Mark } from '../src/chart';

const ACC = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
const INK = { ink: '#000000', muted: '#555555', grid: '#dddddd', surface: '#ffffff' };
const measure = (t: string, size: number) => t.length * size * 0.55;
const rects = (m: Mark[]) => m.filter(x => x.k === 'rect' && x.fill !== undefined && x.w > 0.5 * 0 && x.h > 0) as Extract<Mark, { k: 'rect' }>[];

describe('chart data', () => {
  it('reads a pasted table', () => {
    const c = fromTable('Quarter\tNorth\tSouth\nQ1\t1,200\t$5\nQ2\t3\t40%', 'line')!;
    expect(c.cats).toEqual(['Q1', 'Q2']);
    expect(c.series.map(s => s.name)).toEqual(['North', 'South']);
    expect(c.series[0].vals).toEqual([1200, 3]);
    expect(c.series[1].vals).toEqual([5, 40]);
    expect(fromTable('just one line', 'line')).toBeNull();
    expect(num('abc')).toBe(0);
  });
  it('adds and removes categories and series but keeps at least one', () => {
    let c = addSeries(addCategory(sampleChart()));
    expect(c.cats.length).toBe(5); expect(c.series.length).toBe(4); expect(c.series[3].vals.length).toBe(5);
    c = dropCategory(c, 0); expect(c.cats[0]).toBe('Q2'); expect(c.series[0].vals.length).toBe(4);
    const one = { ...c, series: [c.series[0]] };
    expect(dropSeries(one, 0).series.length).toBe(1);
  });
});

describe('scales', () => {
  it('picks round bounds and steps', () => {
    expect(niceScale(0, 4.5)).toEqual({ min: 0, max: 5, step: 1 });
    expect(niceScale(-3, 47)).toEqual({ min: -10, max: 50, step: 10 });
    expect(niceScale(2, 2).max).toBeGreaterThan(2);
    expect(tickLabel(0.30000000000000004)).toBe('0.3');
    expect(tickLabel(25000)).toBe('25K');
    expect(tickLabel(0.5, true)).toBe('50%');
  });
});

describe('layout', () => {
  it('draws one bar per value in a column chart, inside the box', () => {
    const c = sampleChart('column'), m = chartLayout(c, 480, 300, ACC, INK, measure);
    const bars = rects(m).filter(r => r.w > 12);
    expect(bars.length).toBe(12);
    for (const b of bars) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(480); expect(b.y + b.h).toBeLessThanOrEqual(300); }
    expect(m.some(x => x.k === 'text' && x.text === 'Series 2')).toBe(true);
  });
  it('stacks to the category total and fills 100% charts to the top', () => {
    const p = chartLayout({ ...sampleChart('percentColumn'), legend: 'none' }, 400, 300, ACC, INK, measure);
    const bars = rects(p).filter(r => r.w > 12);
    const tops = new Map<number, number>(); for (const b of bars) tops.set(b.x, Math.min(tops.get(b.x) ?? 1e9, b.y));
    expect(new Set([...tops.values()].map(v => Math.round(v))).size).toBe(1);
  });
  it('lays bars out sideways', () => {
    const m = chartLayout(sampleChart('bar'), 480, 300, ACC, INK, measure);
    const bars = rects(m).filter(r => r.h > 4 && r.h < 40 && r.w !== r.h);
    expect(bars.length).toBe(12);
    expect(bars.every(b => b.w > 0)).toBe(true);
  });
  it('draws lines, markers, and areas', () => {
    const lm = chartLayout(sampleChart('lineMarkers'), 480, 300, ACC, INK, measure);
    expect(lm.filter(x => x.k === 'path').length).toBe(3);
    expect(lm.filter(x => x.k === 'dot').length).toBe(12);
    const ar = chartLayout(sampleChart('stackedArea'), 480, 300, ACC, INK, measure);
    expect(ar.filter(x => x.k === 'path' && x.fill).length).toBe(3);
  });
  it('slices a pie by category with percent labels', () => {
    const m = chartLayout(sampleChart('pie'), 400, 400, ACC, INK, measure);
    expect(m.filter(x => x.k === 'path').length).toBe(4);
    const pct = m.filter(x => x.k === 'text' && /%$/.test(x.text)).map(x => (x as { text: string }).text);
    expect(pct.reduce((a, t) => a + parseInt(t), 0)).toBeGreaterThanOrEqual(99);
    expect(chartLayout(sampleChart('doughnut'), 400, 400, ACC, INK, measure).filter(x => x.k === 'path').length).toBe(4);
  });
  it('colors series from the accents, and pie slices per category', () => {
    expect(seriesColors(sampleChart(), ACC)).toEqual(ACC.slice(0, 3));
    expect(seriesColors(sampleChart('pie'), ACC).length).toBe(4);
    const c = sampleChart(); c.series[1].color = '#ff0000';
    expect(seriesColors(c, ACC)[1]).toBe('#ff0000');
  });
  it('lays out every kind without errors', () => {
    for (const [k] of CHART_KINDS) expect(chartLayout({ ...sampleChart(k), title: 'Sales', labels: true, legend: 'right' }, 300, 200, ACC, INK, measure).length).toBeGreaterThan(5);
  });
});
