/**
 * Deck themes, slide layouts, and placeholders, ported from DeckCraft (MIT or Apache-2.0, ArtCraft Team
 * and the DeckCraft contributors). A theme is a 12-slot color scheme plus a heading and a body font.
 * Pieces keep plain colors so everything else reads them as usual; `tc` remembers which slot a field
 * came from, and changing the theme repaints the fields still holding their slot's value.
 *
 * Layouts are defined on DeckCraft's 960 by 540 base and scaled to the slide. Pure functions over a
 * page's elements; the caller commits so every change is undoable.
 */
import { bbox, fitText } from './geometry';
import { parseHex } from './palette';
import type { El, Lookup } from './types';

export const SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const;
export type Slot = typeof SLOTS[number];
/** The ten slots offered as swatches, in the order Office shows them. */
export const SWATCH_SLOTS: Slot[] = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
export const SLOT_NAMES: Record<Slot, string> = {
  dk1: 'Text', lt1: 'Background', dk2: 'Text 2', lt2: 'Background 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3',
  accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Link', folHlink: 'Visited link',
};

export interface DeckTheme {
  id: string;
  name: string;
  colors: Record<Slot, string>;
  /** The theme's own font names, and the system stacks (`FONTS` keys) the canvas uses for them. */
  major: string;
  minor: string;
  majorKey: string;
  minorKey: string;
}

/** Mixes two colors in sRGB: `t` of `a`, the rest `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a), y = parseHex(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round((v * t + y[i] * (1 - t)) * 255).toString(16).padStart(2, '0')).join('');
}

const theme = (id: string, name: string, hex: string, major: string, minor: string, majorKey: string, minorKey = 'sans'): DeckTheme => {
  const list = hex.split(' ');
  return { id, name, colors: Object.fromEntries(SLOTS.map((s, i) => [s, '#' + list[i].toLowerCase()])) as Record<Slot, string>, major, minor, majorKey, minorKey };
};

/** DeckCraft's built-in themes. Slot order: dk1 lt1 dk2 lt2 accent1..6 hlink folHlink. */
export const THEMES: DeckTheme[] = [
  theme('standard', 'Standard', '000000 FFFFFF 1E2B3C EDEBE7 2E6FD8 F26B1D 2EA36F 8A5CD8 D83F6B E3B21C 2E6FD8 7A5BA6', 'Inter', 'Inter', 'sans'),
  theme('harbor', 'Harbor', '0B1F2A FFFFFF 12384D E4EEF2 1B7FA6 36B3A8 F2C14E F78154 5D576B 8AA29E 1B7FA6 5D576B', 'Merriweather', 'Open Sans', 'serif'),
  theme('ember', 'Ember', '1A1A1A FFFCF7 3D2B1F F6EDE3 D9480F F59F00 A61E4D 5C940D 1971C2 862E9C D9480F 862E9C', 'Montserrat', 'Lato', 'sans'),
  theme('meadow', 'Meadow', '14281D FFFFFF 2D4A37 EEF5EE 4C9A2A A4C639 2F6F4E E9B44C 9B2915 50A2A7 2F6F4E 9B2915', 'Merriweather', 'Open Sans', 'serif'),
  theme('nocturne', 'Nocturne', 'FFFFFF 121826 F2F4F8 1E2638 7C5CFF 00C2A8 FF6B9A FFC53D 4DA3FF B2F35F 7C5CFF FF6B9A', 'Inter', 'Inter', 'sans'),
  theme('paper', 'Paper', '262626 FFFFFF 404040 F2F2F2 595959 8C8C8C C0504D 4F81BD 9BBB59 F79646 4F81BD 8064A2', 'Playfair Display', 'Lato', 'serif'),
  theme('coral', 'Coral Reef', '0F2A33 FFFFFF 0E4D64 FDF1EC FF6F59 254441 43AA8B B2B09B EF3054 3F88C5 3F88C5 EF3054', 'Poppins', 'Nunito Sans', 'round'),
  theme('slate', 'Slate', '111827 FFFFFF 374151 F3F4F6 6366F1 0EA5E9 10B981 F59E0B EF4444 8B5CF6 6366F1 8B5CF6', 'Roboto', 'Roboto', 'sans'),
];
export const themeById = (id?: string): DeckTheme => THEMES.find(t => t.id === id) || THEMES[0];

/**
 * A theme value: a slot ('accent1'), a slot toward the background ('dk1~75' is 75% text color, 25%
 * background, the way Office tints footers), or a font role ('major', 'minor').
 */
export function themeValue(spec: string, th: DeckTheme): string | undefined {
  if (spec === 'major') return th.majorKey;
  if (spec === 'minor') return th.minorKey;
  const [slot, pct] = spec.split('~') as [Slot, string?];
  const col = th.colors[slot];
  if (!col) return undefined;
  return pct ? mix(col, th.colors.lt1, Number(pct) / 100) : col;
}

/** The theme of a page: its first slide's, or the standard theme when it has none. */
export function pageTheme(els: Record<string, El> | El[]): DeckTheme {
  const list = Array.isArray(els) ? els : Object.values(els);
  const first = list.filter(e => e.type === 'frame' && (e.slide || 0) > 0).sort((a, b) => a.slide! - b.slide!)[0];
  return themeById(first && first.theme);
}

/** Links a field to a theme value and sets the field to it. */
export function linkTheme(e: El, key: string, spec: string, th: DeckTheme) {
  const v = themeValue(spec, th);
  if (v == null) return;
  (e as unknown as Record<string, unknown>)[key] = v;
  e.tc = { ...(e.tc || {}), [key]: spec };
}

/** True when a field still holds its linked theme value. */
export const linked = (e: El, key: string, th: DeckTheme) =>
  !!e.tc && !!e.tc[key] && (e as unknown as Record<string, unknown>)[key] === themeValue(e.tc[key], th);

/**
 * Switches a page to another theme: every slide records it, and every field still holding its linked
 * value from the old theme takes the new one. Fields changed by hand lose their link and stay.
 */
export function applyTheme(els: Record<string, El>, id: string) {
  const from = pageTheme(els), to = themeById(id);
  for (const e of Object.values(els)) {
    if (e.type === 'frame' && e.slide) e.theme = to.id;
    if (!e.tc) continue;
    const rec = e as unknown as Record<string, unknown>, next: Record<string, string> = {};
    for (const [key, spec] of Object.entries(e.tc)) {
      if (rec[key] !== themeValue(spec, from)) continue;
      rec[key] = themeValue(spec, to);
      next[key] = spec;
    }
    if (Object.keys(next).length) e.tc = next; else delete e.tc;
    if (e.type === 'text' || e.ph) fitText(e);
  }
}

/* ---------- Layouts ---------- */

/** One placeholder of a layout, on the 960 by 540 base. Sizes are points at that base. */
interface PhDef {
  ph: string;
  box: [number, number, number, number];
  size: number;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  va?: 'top' | 'middle' | 'bottom';
  /** Font role and text color, as theme values. */
  font: 'major' | 'minor';
  color: string;
}
const TITLE: PhDef = { ph: 'title', box: [60, 29, 840, 104], size: 44, weight: 600, va: 'middle', font: 'major', color: 'dk2' };
const BODY: PhDef = { ph: 'body', box: [60, 144, 840, 343], size: 28, va: 'top', font: 'minor', color: 'dk1' };

export interface Layout { label: string; icon: string; phs: PhDef[] }
/** DeckCraft's layouts, less the two vertical-text ones. Keys of the older layouts are kept. */
export const LAYOUTS: Record<string, Layout> = {
  title: { label: 'Title slide', icon: 'M3 5h14v10H3zM6 9h8M7.5 11.5h5', phs: [
    { ph: 'title', box: [120, 88, 720, 188], size: 60, weight: 600, align: 'center', va: 'bottom', font: 'major', color: 'dk2' },
    { ph: 'subtitle', box: [120, 284, 720, 130], size: 24, align: 'center', va: 'top', font: 'minor', color: 'dk1~75' }] },
  titleBody: { label: 'Title and content', icon: 'M3 5h14v10H3zM5.5 8h7M5.5 10.5h9M5.5 12.5h6', phs: [TITLE, BODY] },
  section: { label: 'Section header', icon: 'M3 5h14v10H3zM5.5 9.5h8M5.5 12h5', phs: [
    { ph: 'title', box: [65, 135, 830, 225], size: 60, weight: 600, va: 'bottom', font: 'major', color: 'dk2' },
    { ph: 'body', box: [65, 362, 830, 118], size: 24, va: 'top', font: 'minor', color: 'dk1~82' }] },
  twoCol: { label: 'Two content', icon: 'M3 5h14v10H3zM5.5 8h9M5.5 10.5h3.5M11 10.5h3.5M5.5 12.5h3.5M11 12.5h3.5', phs: [
    TITLE, { ...BODY, box: [60, 144, 412, 343] }, { ...BODY, ph: 'body2', box: [488, 144, 412, 343] }] },
  compare: { label: 'Comparison', icon: 'M3 5h14v10H3zM5.5 8h9M5.5 10h3.5M11 10h3.5M5.5 12h3.5M11 12h3.5', phs: [
    TITLE,
    { ph: 'head', box: [60, 133, 412, 62], size: 24, weight: 700, va: 'bottom', font: 'minor', color: 'dk1' },
    { ...BODY, box: [60, 198, 412, 289], size: 24 },
    { ph: 'head2', box: [488, 133, 412, 62], size: 24, weight: 700, va: 'bottom', font: 'minor', color: 'dk1' },
    { ...BODY, ph: 'body2', box: [488, 198, 412, 289], size: 24 }] },
  titleOnly: { label: 'Title only', icon: 'M3 5h14v10H3zM5.5 8h9', phs: [TITLE] },
  contentCaption: { label: 'Content with caption', icon: 'M3 5h14v10H3zM5 8h4M5 10.5h3M11 7.5h4.5v6H11z', phs: [
    { ph: 'title', box: [60, 36, 322, 126], size: 32, weight: 600, va: 'bottom', font: 'major', color: 'dk2' },
    { ...BODY, box: [412, 78, 488, 384] },
    { ph: 'caption', box: [60, 162, 322, 300], size: 16, va: 'top', font: 'minor', color: 'dk1' }] },
  pictureCaption: { label: 'Picture with caption', icon: 'M3 5h14v10H3zM5 8h4M5 10.5h3M11 7.5h4.5v6H11zM11 12l1.5-1.5 1.2 1 1.8-2', phs: [
    { ph: 'title', box: [60, 36, 322, 126], size: 32, weight: 600, va: 'bottom', font: 'major', color: 'dk2' },
    { ph: 'picture', box: [412, 78, 488, 384], size: 16, va: 'middle', font: 'minor', color: 'dk1~60' },
    { ph: 'caption', box: [60, 162, 322, 300], size: 16, va: 'top', font: 'minor', color: 'dk1' }] },
  blank: { label: 'Blank', icon: 'M3 5h14v10H3z', phs: [] },
};

/** What an empty placeholder says on the board. Nothing shows in exports or while presenting. */
export function phPrompt(ph: string): string {
  if (ph === 'title') return 'Click to add title';
  if (ph === 'subtitle') return 'Click to add subtitle';
  if (ph === 'head' || ph === 'head2') return 'Click to add heading';
  if (ph === 'picture') return 'Click to add a picture';
  return 'Click to add text';
}

/** Layout scale for a slide: base units to px across and down, and for type (points at the base). */
const scaleOf = (f: { w: number; h: number }) => ({ sx: f.w / 960, sy: f.h / 540, k: Math.min(f.w / 960, f.h / 540) });

/** Puts a placeholder piece where its layout says, with the layout's style, keeping its text. */
function place(e: El, d: PhDef, f: El, th: DeckTheme) {
  const { sx, sy, k } = scaleOf(f);
  e.x = Math.round(f.x + d.box[0] * sx); e.y = Math.round(f.y + d.box[1] * sy);
  e.w = Math.round(d.box[2] * sx); e.h = Math.round(d.box[3] * sy);
  e.ph = d.ph; e.va = d.va || 'top';
  e.size = Math.round(d.size * k);
  if (d.weight) e.weight = d.weight; else delete e.weight;
  if (d.align) e.align = d.align; else delete e.align;
  delete e.italic; delete e.fit;
  e.tc = {};
  linkTheme(e, 'font', d.font, th);
  linkTheme(e, 'color', d.color, th);
  fitText(e);
}

/** The pieces of a slide that are placeholders. */
export function placeholders(els: Record<string, El>, f: El, get: Lookup): El[] {
  const x1 = f.x + f.w, y1 = f.y + f.h;
  return Object.values(els).filter(e => {
    if (!e.ph || e.id === f.id) return false;
    const b = bbox(e, get), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return cx >= f.x && cx <= x1 && cy >= f.y && cy <= y1;
  });
}

/** Which placeholders can take another's content when the layout changes. */
const GROUP: Record<string, string> = { title: 'title', subtitle: 'text', body: 'text', caption: 'text', head: 'text', body2: 'text2', head2: 'text2', picture: 'picture' };

/**
 * Lays a slide out again. Placeholders keep their text and move to the new layout's boxes (same kind
 * first, then a kind that can hold it); missing ones are added empty; leftover empty ones are removed,
 * and leftover filled ones stay where they are as ordinary text. `from` names the slide's placeholders
 * when the frame has just been resized. Returns the ids added and removed.
 */
export function applyLayout(els: Record<string, El>, f: El, key: string, get: Lookup, uid: (p: string) => string, z: number, from?: El[]): { added: string[]; removed: string[] } {
  const lay = LAYOUTS[key] || LAYOUTS.blank, th = pageTheme(els);
  const old = (from || placeholders(els, f, get)).sort((a, b) => a.y - b.y || a.x - b.x);
  const taken = new Set<string>(), match = new Map<PhDef, El>();
  for (const d of lay.phs) { const e = old.find(o => !taken.has(o.id) && o.ph === d.ph); if (e) { taken.add(e.id); match.set(d, e); } }
  for (const d of lay.phs) {
    if (match.has(d)) continue;
    const e = old.find(o => !taken.has(o.id) && GROUP[o.ph!] === GROUP[d.ph] && (d.ph !== 'picture' || o.type === 'text'));
    if (e) { taken.add(e.id); match.set(d, e); }
  }
  const added: string[] = [], removed: string[] = [];
  let zi = z;
  for (const d of lay.phs) {
    let e = match.get(d);
    if (!e) { e = { id: uid('e'), type: 'text', z: zi++, x: 0, y: 0, w: 10, h: 10, text: '' }; els[e.id] = e; added.push(e.id); }
    place(e, d, f, th);
  }
  for (const o of old) {
    if (taken.has(o.id)) continue;
    if (!o.text || !o.text.trim()) { delete els[o.id]; removed.push(o.id); }
    else { delete o.ph; delete o.va; delete o.fit; fitText(o); }
  }
  f.layout = key;
  return { added, removed };
}

/* ---------- Footers ---------- */

/** Footer boxes on the 960 by 540 base: date, footer text, slide number. */
const FOOT = { date: [60, 500, 216, 28, 'left'], text: [318, 500, 324, 28, 'center'], num: [684, 500, 216, 28, 'right'] } as const;

/**
 * A slide's footer as ordinary text pieces to draw with it (they are not on the board, so they can't be
 * picked). `today` is the date as it should read.
 */
export function footerPieces(f: El, th: DeckTheme, today: string): El[] {
  const ft = f.foot;
  if (!ft || !f.slide) return [];
  const { sx, sy, k } = scaleOf(f), out: El[] = [];
  const add = (key: keyof typeof FOOT, text: string) => {
    const [bx, by, bw, bh, align] = FOOT[key];
    out.push({ id: `foot-${key}-${f.id}`, type: 'text', z: 0, x: Math.round(f.x + bx * sx), y: Math.round(f.y + by * sy), w: Math.round(bw * sx), h: Math.round(bh * sy),
      text, size: Math.round(12 * k), align, va: 'middle', ph: 'foot', font: th.minorKey, color: themeValue('dk1~75', th) });
  };
  if (ft.date) add('date', today);
  if (ft.text) add('text', ft.text);
  if (ft.num) add('num', String(f.slide));
  return out;
}

/** The date as a footer shows it, such as November 17, 2026. */
export const footDate = (d = new Date()) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
