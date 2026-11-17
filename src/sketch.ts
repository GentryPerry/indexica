/** Rough, hand-drawn outlines. The wobble is seeded from the piece's id, so a piece looks the same every time it draws. */
export interface Pt { x: number; y: number }

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Points along a polyline no more than `step` apart. */
export function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

const f = (v: number) => Math.round(v * 10) / 10;
function pass(pts: Pt[], r: () => number, amp: number): string {
  const j = pts.map(p => ({ x: p.x + (r() * 2 - 1) * amp, y: p.y + (r() * 2 - 1) * amp }));
  let d = `M${f(j[0].x)} ${f(j[0].y)}`;
  for (let i = 1; i < j.length - 1; i++) d += `Q${f(j[i].x)} ${f(j[i].y)} ${f((j[i].x + j[i + 1].x) / 2)} ${f((j[i].y + j[i + 1].y) / 2)}`;
  const z = j[j.length - 1];
  return d + `L${f(z.x)} ${f(z.y)}`;
}

/** Two slightly different wobbly strokes along the points, like a line drawn twice by hand. */
export function roughPath(pts: Pt[], seed: number, amp: number): string {
  if (pts.length < 2) return '';
  const dense = densify(pts, 22), r = rng(seed);
  return pass(dense, r, amp) + pass(dense, r, amp * 0.75);
}

/** Outline points for a shape, closed back to its start. */
export function shapeOutline(type: string, x: number, y: number, w: number, h: number): Pt[] {
  if (type === 'ellipse') {
    const n = 32, pts = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return { x: x + w / 2 + Math.cos(a) * w / 2, y: y + h / 2 + Math.sin(a) * h / 2 }; });
    return [...pts, pts[0]];
  }
  if (type === 'diamond') return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }, { x: x + w / 2, y }];
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
}

/** How much a hand-drawn outline wobbles for a piece of this size. */
export const wobble = (w: number, h: number) => Math.min(2.4, Math.max(1, Math.min(w, h) * 0.015));
