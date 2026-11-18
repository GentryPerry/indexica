/**
 * Presentations. A slide is a frame with a slide number: its contents are whatever sits on the board
 * inside it, so a brainstorm becomes a deck without rebuilding anything. Pure functions over a page's
 * elements; the caller commits the changes so they are undoable.
 */
import { bbox, fitText } from './geometry';
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

type Piece = Omit<El, 'id' | 'z'>;
const text = (x: number, y: number, w: number, value: string, size: number, weight: number, extra: Partial<El> = {}): Piece =>
  ({ type: 'text', x, y, w, h: size * 1.3 + 8, text: value, size, weight, ...extra });

/** Slide layouts. Each returns the text pieces placed inside a frame of the given box. */
export const LAYOUTS: Record<string, { label: string; build: (b: { x: number; y: number; w: number; h: number }) => Piece[] }> = {
  title: { label: 'Title', build: b => [
    text(b.x + b.w * 0.1, b.y + b.h * 0.36, b.w * 0.8, 'Presentation title', Math.round(b.h * 0.09), 700, { align: 'center' }),
    text(b.x + b.w * 0.15, b.y + b.h * 0.36 + b.h * 0.15, b.w * 0.7, 'Subtitle or presenter name', Math.round(b.h * 0.038), 400, { align: 'center', color: '#5d697c' })] },
  titleBody: { label: 'Title and body', build: b => [
    text(b.x + b.w * 0.07, b.y + b.h * 0.1, b.w * 0.86, 'Slide title', Math.round(b.h * 0.066), 700),
    text(b.x + b.w * 0.07, b.y + b.h * 0.28, b.w * 0.8, 'First point\nSecond point\nThird point', Math.round(b.h * 0.036), 400)] },
  twoCol: { label: 'Two columns', build: b => [
    text(b.x + b.w * 0.07, b.y + b.h * 0.1, b.w * 0.86, 'Slide title', Math.round(b.h * 0.066), 700),
    text(b.x + b.w * 0.07, b.y + b.h * 0.28, b.w * 0.4, 'Left column', Math.round(b.h * 0.036), 400),
    text(b.x + b.w * 0.53, b.y + b.h * 0.28, b.w * 0.4, 'Right column', Math.round(b.h * 0.036), 400)] },
  section: { label: 'Section header', build: b => [
    text(b.x + b.w * 0.08, b.y + b.h * 0.4, b.w * 0.84, 'Section title', Math.round(b.h * 0.085), 700),
    text(b.x + b.w * 0.08, b.y + b.h * 0.4 + b.h * 0.14, b.w * 0.7, 'What this part covers', Math.round(b.h * 0.036), 400)] },
  blank: { label: 'Blank', build: () => [] },
};
/** Layouts that look best on a dark background. */
export const DARK_LAYOUTS = new Set(['section']);

/**
 * A new slide: the frame plus its layout's text, ready to add to the page. `uid` makes ids and `z` is
 * the next free layer. The frame is numbered after the page's last slide.
 */
export function newSlide(els: Record<string, El>, get: Lookup, layout: string, size: SlideSize, uid: (p: string) => string, z: number): El[] {
  const at = nextSlideSpot(els, get), { w, h } = SLIDE_SIZES[size], n = slidesOf(els).length + 1;
  const dark = DARK_LAYOUTS.has(layout);
  const frame: El = { id: uid('e'), type: 'frame', z, x: at.x, y: at.y, w, h, text: (LAYOUTS[layout] || LAYOUTS.blank).label, slide: n, fill: dark ? '#17202d' : '#ffffff' };
  const pieces = (LAYOUTS[layout] || LAYOUTS.blank).build(frame).map((p, i) => {
    const e = { ...p, id: uid('e'), z: z + 1 + i, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w) } as El;
    if (dark && e.color) e.color = '#aab3c2';
    fitText(e);
    return e;
  });
  return [frame, ...pieces];
}
