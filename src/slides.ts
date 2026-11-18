/**
 * Presentations. A slide is a frame with a slide number: its contents are whatever sits on the board
 * inside it, so a brainstorm becomes a deck without rebuilding anything. Pure functions over a page's
 * elements; the caller commits the changes so they are undoable.
 */
import { applyLayout, LAYOUTS, linkTheme, pageTheme } from './deck';
import { bbox } from './geometry';
import { lightness } from './palette';
import type { El, Lookup } from './types';

export type SlideSize = 'wide' | 'standard' | 'square';
export const SLIDE_SIZES: Record<SlideSize, { label: string; w: number; h: number }> = {
  wide: { label: 'Wide 16:9', w: 1280, h: 720 },
  standard: { label: 'Standard 4:3', w: 1024, h: 768 },
  square: { label: 'Square 1:1', w: 1080, h: 1080 },
};

/** Slide backgrounds: white, paper, mist, butter, mint, ink, and the accent. */
export const SLIDE_BGS: [string, string][] = [['#ffffff', 'White'], ['#f6f3ec', 'Paper'], ['#eef1fb', 'Mist'], ['#fff6db', 'Butter'], ['#e6f5ec', 'Mint'], ['#17202d', 'Ink'], ['#2447d6', 'Cobalt']];

/** The size preset a frame matches, if any. */
export function sizeOf(f: El): SlideSize | null {
  for (const [k, v] of Object.entries(SLIDE_SIZES)) if (f.w === v.w && f.h === v.h) return k as SlideSize;
  return null;
}

/** Slide frames on a page, in deck order. */
export function slidesOf(els: Record<string, El> | El[]): El[] {
  const list = Array.isArray(els) ? els : Object.values(els);
  return list.filter(e => e.type === 'frame' && (e.slide || 0) > 0).sort((a, b) => a.slide! - b.slide! || a.z - b.z);
}

/** Numbers the slides 1..n in their current order, closing gaps. */
export function renumber(els: Record<string, El>) {
  slidesOf(els).forEach((f, i) => { f.slide = i + 1; });
}

/** Moves a slide to a new position in the deck (0-based), shifting the others. */
export function moveSlide(els: Record<string, El>, id: string, to: number) {
  const list = slidesOf(els), from = list.findIndex(f => f.id === id);
  if (from < 0) return;
  const [f] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, f);
  list.forEach((s, i) => { s.slide = i + 1; });
}

/** Makes a frame the last slide, or takes it out of the deck. */
export function setSlide(els: Record<string, El>, f: El, on: boolean) {
  if (on) { if (!f.slide) f.slide = slidesOf(els).length + 1; }
  else { delete f.slide; renumber(els); }
}

/** Pieces drawn on a slide: everything except the frame itself that overlaps it. */
export function slideMembers(els: Record<string, El>, f: El, get: Lookup): El[] {
  const x1 = f.x + f.w, y1 = f.y + f.h;
  return Object.values(els).filter(e => {
    if (e.id === f.id) return false;
    const b = bbox(e, get);
    return b.x < x1 && b.x + b.w > f.x && b.y < y1 && b.y + b.h > f.y;
  });
}

/** Where a new slide goes: right of the last slide, or right of everything if there are none. */
export function nextSlideSpot(els: Record<string, El>, get: Lookup, gap = 160): { x: number; y: number } {
  const slides = slidesOf(els);
  if (slides.length) { const last = slides[slides.length - 1]; return { x: last.x + last.w + gap, y: last.y }; }
  const list = Object.values(els);
  if (!list.length) return { x: 0, y: 0 };
  const bs = list.map(e => bbox(e, get));
  return { x: Math.round(Math.max(...bs.map(b => b.x + b.w)) + gap), y: Math.round(Math.min(...bs.map(b => b.y))) };
}

/** True when a background is dark enough that default text on it should be light. */
export const darkBg = (hex?: string) => !!hex && lightness(hex) < 0.6;

/**
 * A new slide: the frame plus its layout's placeholders, ready to add to the page. `uid` makes ids and
 * `z` is the next free layer. The frame is numbered after the page's last slide and takes the page's
 * theme and the last slide's footer.
 */
export function newSlide(els: Record<string, El>, get: Lookup, layout: string, size: SlideSize, uid: (p: string) => string, z: number): El[] {
  const at = nextSlideSpot(els, get), { w, h } = SLIDE_SIZES[size], list = slidesOf(els), th = pageTheme(els), prev = list[list.length - 1];
  const key = LAYOUTS[layout] ? layout : 'blank';
  const frame: El = { id: uid('e'), type: 'frame', z, x: at.x, y: at.y, w, h, text: LAYOUTS[key].label, slide: list.length + 1, theme: th.id, layout: key };
  if (prev && prev.foot) frame.foot = { ...prev.foot };
  linkTheme(frame, 'fill', 'lt1', th);
  const tmp: Record<string, El> = { [frame.id]: frame };
  const { added } = applyLayout(tmp, frame, key, id => tmp[id] || get(id), uid, z + 1);
  return [frame, ...added.map(id => tmp[id])];
}
