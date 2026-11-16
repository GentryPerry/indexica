/**
 * Stickers and washi tape. Stickers are drawn in a 100 x 100 box and scaled to the element.
 * Each layer is painted with the sticker's own color ('fill'), white ('white'), or a white outline ('line').
 */
export interface Layer { d: string; paint: 'fill' | 'white' | 'line' }

function burst(points: number, outerR: number, innerR: number): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? innerR : outerR, a = Math.PI * i / points - Math.PI / 2;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return 'M' + out.join('L') + 'Z';
}
const DISC = 'M50 5A45 45 0 1 0 50 95A45 45 0 1 0 50 5Z';

export const STICKERS: Record<string, { label: string; layers: Layer[] }> = {
  star: { label: 'Star', layers: [{ d: burst(5, 47, 20), paint: 'fill' }] },
  heart: { label: 'Heart', layers: [{ d: 'M50 90C20 66 5 49 5 31C5 16 17 7 30 7C39 7 46 12 50 19C54 12 61 7 70 7C83 7 95 16 95 31C95 49 80 66 50 90Z', paint: 'fill' }] },
  check: { label: 'Done', layers: [{ d: DISC, paint: 'fill' }, { d: 'M28 52L44 68L74 34', paint: 'line' }] },
  alert: { label: 'Important', layers: [{ d: DISC, paint: 'fill' }, { d: 'M50 24L50 56M50 72L50 73', paint: 'line' }] },
  question: { label: 'Question', layers: [{ d: DISC, paint: 'fill' }, { d: 'M36 38C36 22 64 22 64 38C64 48 50 48 50 60M50 74L50 75', paint: 'line' }] },
  burst: { label: 'Burst', layers: [{ d: burst(12, 48, 36), paint: 'fill' }] },
  bolt: { label: 'Bolt', layers: [{ d: 'M58 4L18 56L44 56L36 96L82 40L54 40Z', paint: 'fill' }] },
  arrow: { label: 'Arrow', layers: [{ d: 'M6 36L54 36L54 12L96 50L54 88L54 64L6 64Z', paint: 'fill' }] },
  pin: { label: 'Pin', layers: [{ d: 'M50 96C50 96 16 58 16 37A34 34 0 1 1 84 37C84 58 50 96 50 96Z', paint: 'fill' }, { d: 'M50 25A12 12 0 1 0 50 49A12 12 0 1 0 50 25Z', paint: 'white' }] },
  flag: { label: 'Flag', layers: [{ d: 'M18 6L26 6L26 96L18 96Z', paint: 'fill' }, { d: 'M26 10L90 28L26 50Z', paint: 'fill' }] },
  bubble: { label: 'Speech bubble', layers: [{ d: 'M12 12H88Q96 12 96 20V60Q96 68 88 68H46L24 90L30 68H12Q4 68 4 60V20Q4 12 12 12Z', paint: 'fill' }] },
  flower: { label: 'Flower', layers: [{ d: [0, 72, 144, 216, 288].map(a => { const r = a * Math.PI / 180, x = 50 + 26 * Math.sin(r), y = 50 - 26 * Math.cos(r); return `M${(x - 20).toFixed(1)} ${y.toFixed(1)}a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z`; }).join(''), paint: 'fill' }, { d: 'M50 37A13 13 0 1 0 50 63A13 13 0 1 0 50 37Z', paint: 'white' }] },
};

export const TAPES: Record<string, string> = { stripes: 'Stripes', dots: 'Dots', grid: 'Grid', solid: 'Solid' };

const f = (v: number) => v.toFixed(1);

/** Outline of a strip of tape with torn, zigzag ends. */
export function tapeOutline(x: number, y: number, w: number, h: number): string {
  const teeth = Math.max(2, Math.round(h / 7)), stepY = h / teeth, depth = Math.min(4, w / 6);
  let d = `M${f(x)} ${f(y)}L${f(x + w)} ${f(y)}`;
  for (let i = 0; i < teeth; i++) d += `L${f(x + w - depth)} ${f(y + stepY * (i + 0.5))}L${f(x + w)} ${f(y + stepY * (i + 1))}`;
  d += `L${f(x)} ${f(y + h)}`;
  for (let i = teeth - 1; i >= 0; i--) d += `L${f(x + depth)} ${f(y + stepY * (i + 0.5))}L${f(x)} ${f(y + stepY * i)}`;
  return d + 'Z';
}

/** The printed pattern on a strip of tape. Lines for stripes and grid, filled circles for dots. Empty for solid. */
export function tapePattern(pattern: string, x: number, y: number, w: number, h: number): { d: string; filled: boolean } {
  let d = '';
  if (pattern === 'stripes') {
    for (let i = -h; i < w; i += 12) d += `M${f(x + i)} ${f(y + h)}L${f(x + i + h)} ${f(y)}`;
    return { d, filled: false };
  }
  if (pattern === 'grid') {
    for (let i = 10; i < w; i += 10) d += `M${f(x + i)} ${f(y)}L${f(x + i)} ${f(y + h)}`;
    for (let j = 10; j < h; j += 10) d += `M${f(x)} ${f(y + j)}L${f(x + w)} ${f(y + j)}`;
    return { d, filled: false };
  }
  if (pattern === 'dots') {
    let row = 0;
    for (let j = 7; j < h; j += 10, row++) for (let i = row % 2 ? 12 : 6; i < w; i += 12) d += `M${f(x + i - 2.4)} ${f(y + j)}a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0Z`;
    return { d, filled: true };
  }
  return { d: '', filled: false };
}
