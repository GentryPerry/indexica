import { describe, it, expect } from 'vitest';
import { fromD, pathD, bounds } from '../src/vector';

describe('reading path data', () => {
  it('reads lines and closes', () => {
    const s = fromD('M0 0L100 0L100 100L0 100Z');
    expect(s.length).toBe(1); expect(s[0].closed).toBe(true); expect(s[0].nodes.length).toBe(4);
  });
  it('merges a repeated closing point and keeps its handle', () => {
    const s = fromD('M0 0C10 -10 90 -10 100 0C110 10 110 90 100 100L0 100L0 0Z');
    expect(s[0].nodes.length).toBe(4);
  });
  it('turns quadratics into cubics with the same ends and bounds', () => {
    const s = fromD('M0 0Q50 100 100 0');
    expect(s[0].nodes[0].ox).toBeCloseTo(33.33, 1);
    expect(bounds(s)!.h).toBeCloseTo(50, 0);
  });
  it('round-trips its own output and reads several subpaths', () => {
    const d = 'M0 0C0 -40 100 -40 100 0Z M10 10L20 10L20 20Z';
    const s = fromD(d);
    expect(s.length).toBe(2);
    expect(fromD(pathD(s)).length).toBe(2);
  });
  it('marks lined-up handles smooth', () => {
    const s = fromD('M0 0C10 0 40 50 50 50C60 50 90 0 100 0');
    expect(s[0].nodes[1].s).toBe(true);
  });
});
describe('zero-length steps', () => {
  it('merges a repeated point into the node before it', () => {
    const s = fromD('M0 0L100 0L100 50L100 50C60 50 50 60 50 100L0 100Z');
    expect(s[0].nodes.length).toBe(5);
    expect(s[0].nodes[2].ox).toBe(60);
  });
});
