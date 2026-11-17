/**
 * Board colors on screen. Pieces store the color picked from the swatches; this module decides how
 * that color is painted in the light and dark themes, and derives outlines and text colors from it,
 * working in OKLCH so a change of lightness looks even across hues. Exports always use the light look.
 */

export type Theme = 'light' | 'dark';
type Lch = [l: number, c: number, h: number];

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** Reads #rgb or #rrggbb. Anything else reads as null. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function hexToOklch(hex: string): Lch | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h];
}

function lchToRgb([L, C, H]: Lch): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (rgb: number[]) => rgb.every(v => v >= -0.0005 && v <= 1.0005);

/** OKLCH to hex. Out-of-range colors keep their lightness and hue and lose chroma until they fit. */
export function oklchToHex(lch: Lch): string {
  const L = Math.min(1, Math.max(0, lch[0]));
  let c = Math.max(0, lch[1]), rgb = lchToRgb([L, c, lch[2]]);
  if (!inGamut(rgb)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) { c = (lo + hi) / 2; if (inGamut(lchToRgb([L, c, lch[2]]))) lo = c; else hi = c; }
    rgb = lchToRgb([L, lo, lch[2]]);
  }
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

/** A color with some of its OKLCH parts replaced. */
export function adjust(hex: string, f: (lch: Lch) => Lch): string {
  const lch = hexToOklch(hex);
  return lch ? oklchToHex(f(lch)) : hex;
}

export const lightness = (hex: string) => hexToOklch(hex)?.[0] ?? 0.5;
const neutral = (lch: Lch) => lch[1] < 0.025;

/** Default text colors on light and dark surfaces. The first is also the "Default" text swatch. */
export const INK = { dark: '#1d2530', light: '#eef1f6' };

/** True for a text color that should follow the surface: none set, or the Default swatch. */
export const autoInk = (color?: string) => !color || color.toLowerCase() === INK.dark;

/**
 * How a stored fill is painted. In the dark theme near-white fills become raised dark surfaces and
 * pastels are dimmed a little, so nothing glares against the dark canvas. Strong colors are kept.
 */
export function paintFill(hex: string | undefined, theme: Theme): string | undefined {
  if (!hex || theme === 'light' || hex === 'none' || hex === 'transparent') return hex;
  const lch = hexToOklch(hex);
  if (!lch || lch[0] < 0.8) return hex;
  // Neutrals take the cool tint of the dark chrome, so they sit in the same family as the panels.
  if (neutral(lch)) return oklchToHex([0.27 + (1 - lch[0]) * 1.1, 0.014, 258]);
  return oklchToHex([Math.max(0.8, lch[0] - 0.05), lch[1], lch[2]]);
}

/** The outline drawn around a shape whose outline color was not set: a deeper tone of its own fill. */
export function outlineFor(fill: string | undefined, theme: Theme): string {
  let lch = fill ? hexToOklch(fill) : null;
  if (!lch || neutral(lch)) return theme === 'dark' ? '#6f7a8d' : '#5b6679';
  // Yellows turn olive when darkened, so their edges lean toward amber instead.
  const h = lch[2] > 70 && lch[2] < 115 ? lch[2] - 22 : lch[2];
  lch = [lch[0], lch[1], h];
  // In the dark theme the edge is a deeper tone of the dimmed fill, which reads as a crisp rim.
  return theme === 'dark'
    ? oklchToHex([Math.max(0.8, lch[0] - 0.05) - 0.16, Math.max(lch[1] * 1.3, 0.08), lch[2]])
    : oklchToHex([0.56, Math.max(lch[1] * 1.9, 0.09), lch[2]]);
}

/** Text color for a piece: the one chosen, or the default that reads on its painted surface. */
export function inkOn(painted: string | undefined, chosen: string | undefined, theme: Theme): string {
  if (!autoInk(chosen)) return chosen!;
  if (!painted || painted === 'none' || painted === 'transparent') return theme === 'dark' ? INK.light : INK.dark;
  return lightness(painted) > 0.62 ? INK.dark : INK.light;
}

/** A soft tinted chip for a status color: background, text, and dot. */
export function chip(color: string, theme: Theme): { bg: string; text: string; dot: string } {
  const lch = hexToOklch(color) || [0.6, 0.1, 250] as Lch;
  return theme === 'dark'
    ? { bg: oklchToHex([0.32, lch[1] * 0.45, lch[2]]), text: oklchToHex([0.86, lch[1] * 0.7, lch[2]]), dot: oklchToHex([0.74, lch[1], lch[2]]) }
    : { bg: oklchToHex([0.95, lch[1] * 0.28, lch[2]]), text: oklchToHex([0.45, lch[1] * 0.95, lch[2]]), dot: color };
}

/** Surfaces for cards and tables, which have no fill of their own. */
export const SURFACE = {
  light: { card: '#ffffff', cardLine: '#dde2ea', head: '#f3f5f8', grid: '#e3e7ee' },
  dark: { card: '#222934', cardLine: '#323b49', head: '#2a323e', grid: '#353e4c' },
};
